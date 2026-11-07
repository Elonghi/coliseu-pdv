# Roteiro de migração em produção

Vale para qualquer migration do banco, e em especial para as fases do `docs/PLANO_MULTI_LOJA.md`.

O deploy **não aplica migrations** (o serviço `migrate` fica no perfil `maintenance` do `docker-compose.coolify.yml`). Toda migration é aplicada à mão, com backup antes, na ordem deste roteiro.

As migrations são aplicadas **pelo terminal do app** (container do app no Coolify, pasta `/app`), com `node scripts/migrate.mjs`. A imagem de produção não tem `tsx` nem o código-fonte, então `npm run db:migrate` **não funciona** ali. O backup e os demais comandos de manutenção rodam no servidor, na pasta do compose do recurso (padrão de `DEPLOY_COOLIFY.md`, seção 5).

`node scripts/migrate.mjs` sem argumentos **só consulta**: mostra o banco, quantas migrations estão aplicadas e quais estão pendentes, e não altera nada. Com `--apply` ele aplica as pendentes, todas numa transação (se uma falhar, nenhuma é gravada). É compatível com o migrador do Drizzle: usa a mesma tabela e os mesmos hashes.

## 1. Ensaio inicial (fazer uma vez, antes da fase 1)

Objetivo: provar que o procedimento funciona no seu Coolify sem nenhuma migration pendente, para não descobrir o problema no meio de uma fase.

No terminal do app:

```bash
node scripts/migrate.mjs
```

- **Esperado:** mostra `Banco: <host>/<nome>`, a contagem de migrations e a lista de pendentes (ou `Nenhuma migration pendente.`), sem alterar nada.
- **Se falhar:** o erro aparece na própria saída, em geral conexão com o banco. É preciso resolver antes da fase 1. Guarde a mensagem (sem senhas nem URL de conexão).
- **Confirme também** que `SEED_ON_DEPLOY` está `false` no Coolify.

## 2. Backup (sempre, antes de aplicar)

```bash
docker compose -f docker-compose.coolify.yml --profile maintenance run --rm backup
```

1. Confira que a pasta nova de `backup_storage` tem `database.dump`, `storage.tar.gz` e `SHA256SUMS`.
2. Valide os checksums.
3. Copie a pasta para fora do servidor.

Sem esses três itens, não aplique a migration.

## 3. Ordem entre migration e código

O push na `main` dispara o deploy, e o deploy **não aplica migrations**. Então o app novo sobe antes da migration. Se o código novo já consultar uma tabela ou coluna que ainda não existe, ele falha (por exemplo, o `/api/health` com a consulta a uma tabela nova fica indisponível e o app é marcado como não saudável) até alguém rodar a migration.

Por isso, o que muda o esquema vai **em envios separados**:

| Tipo | Ordem | Por quê |
|---|---|---|
| **Expandir** (cria tabela ou coluna, aceitando nulo) | 1. envio só com a migration e o `schema.ts`, sem nenhum código que use o novo; 2. aplicar a migration; 3. envio com o código que usa | Entre os envios o app funciona igual, porque nada o usa ainda |
| **Preencher dados** | migration ou script, com o código novo ainda desligado | Permite conferir antes de qualquer uso |
| **Endurecer** (`NOT NULL`, chaves, unicidades) | janela curta, fora do horário de uso | Pode bloquear tabelas por alguns segundos |
| **Contrair** (remove coluna ou tabela antiga) | 1. envio do código que não usa mais, 2. alguns dias estável, 3. migration | Remover antes quebra o código em produção |

Se por algum motivo código e migration forem no mesmo envio, aplique a migration **imediatamente depois** do deploy, com `/api/health` em observação, e aceite a janela de erro. Evite isso em fases de endurecer.

Observação: o `migrate` automático antes do app (como era antes de 30/10) elimina essa janela, e voltar a ele é a solução definitiva depois que a causa da falha de 30/10 for resolvida. Até lá vale o procedimento acima.

Aplicar a migration, no terminal do app, depois do backup:

```bash
node scripts/migrate.mjs --apply
```

Alternativa pelo servidor, com o serviço `migrate` do compose (precisa do `tsx`, que só existe nesse serviço): `docker compose -f docker-compose.coolify.yml --profile maintenance run --rm migrate npm run db:migrate`.

## 4. Conferência depois de migrar

1. A saída listou `aplicada: <nome>` para cada migration e terminou com `Migrations aplicadas.` Rodar `node scripts/migrate.mjs` de novo deve dizer `Nenhuma migration pendente.`
2. `/api/health` retorna `status: ok` e `database: ok`.
3. O número de linhas em `drizzle.__drizzle_migrations` é igual ao número de migrations em `drizzle/meta/_journal.json`.
4. Venda de teste, entrada de nota e dashboard funcionando.
5. Cada fase do plano acrescenta suas próprias consultas de conferência, registradas na seção 8.

## 5. Plano de volta

- **Migration de expandir:** é aditiva. Para voltar, basta redeployar o commit anterior; não é preciso desfazer o banco.
- **Qualquer outra:** restaurar o backup feito no passo 2, com o app parado:
  ```bash
  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" database.dump
  ```
  Tudo o que foi gravado depois do backup se perde, por isso o roteiro manda aplicar fora do horário de uso e conferir logo em seguida. Ensaie a restauração num banco de teste antes da fase 3.

## 6. Papel de banco sem privilégio (fase 0)

O usuário do Postgres do compose é superusuário, e superusuário ignora RLS. O isolamento entre contas e lojas só vale com um papel comum, `coliseu_app`.

1. Gere uma senha forte (24+ caracteres, sem espaços), por exemplo `openssl rand -base64 36`.
2. Cadastre-a no Coolify como variável secreta `APP_DB_PASSWORD`. **Nunca** coloque a senha no Git, em chat, em chamado ou em linha de comando.
3. Rode:
   ```bash
   docker compose -f docker-compose.coolify.yml --profile maintenance run --rm migrate node scripts/create-app-role.mjs
   ```
4. A saída confirma o papel, `superusuário: false` e `ignora RLS: false`, e não mostra a senha.

O script pode ser repetido: recria os privilégios e troca a senha. Rode-o sempre com o mesmo usuário que aplica as migrations, para as tabelas futuras já nascerem com permissão.

**Nada muda para o app agora.** Ele continua conectando com o usuário atual. A troca da `DATABASE_URL` do app para esse papel é a fase 5, junto com o RLS.

## 7. Cuidados

- **Uma fase por vez**, com conferência entre elas.
- **Scripts de reset** (`reset-import-data.mjs` e `reset-to-invoice-entry.mjs`) apagam dados de todas as lojas e contas. Não rode depois da fase 2, sem antes ficarem restritos por conta e por loja (obrigatório antes da fase 6).
- **`SEED_ON_DEPLOY` não tem mais efeito no deploy.** Para criar o primeiro administrador num banco novo, aplique as migrations no terminal do app e rode o seed pelo serviço `migrate` (que tem `tsx`): `docker compose -f docker-compose.coolify.yml --profile maintenance run --rm migrate npm run db:seed`, com as senhas de seed definidas no Coolify.
- **Migrations aplicadas só por este roteiro.** Se alguém aplicar uma por outro caminho, registre aqui a data e o motivo.

## 8. Conferências por migration

### 0014 `multi_conta_lojas` (contas, lojas e vínculo de usuários)

Cria `accounts`, `stores` e `user_stores`, acrescenta `users.account_id` e `users.is_account_owner`, e transforma a operação atual numa conta com a loja **Coliseu TCG**. O administrador ativo mais antigo vira proprietário, e todos os usuários ficam vinculados à loja. O app em produção não usa nada disso ainda, então o envio é só da migration e do `schema.ts`.

Depois de aplicar, no banco:

```sql
SELECT a.name AS conta, s.name AS loja FROM accounts a JOIN stores s ON s.account_id = a.id;
SELECT count(*) FILTER (WHERE account_id IS NULL) AS sem_conta, count(*) FILTER (WHERE is_account_owner) AS proprietarios FROM users;
SELECT count(*) AS sem_loja FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id = u.id);
```

Esperado: uma linha "Coliseu TCG / Coliseu TCG", `sem_conta = 0`, `proprietarios = 1` e `sem_loja = 0`. Confira que o proprietário é a pessoa certa; se não for, corrija com `UPDATE users SET is_account_owner = (id = '<id certo>');`.

Usuários criados pelo painel depois da migration e antes do código que usa as lojas ficam sem vínculo. Para vincular, é seguro repetir:

```bash
docker compose -f docker-compose.coolify.yml --profile maintenance run --rm migrate npm run db:link-default-store
```

Volta atrás: a migration é aditiva, então redeployar o commit anterior basta. Para remover as tabelas, restaure o backup.
