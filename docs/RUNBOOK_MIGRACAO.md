# Roteiro de migração em produção

Vale para qualquer migration do banco, e em especial para as fases do `docs/PLANO_MULTI_LOJA.md`.

O deploy **não aplica migrations** (o serviço `migrate` fica no perfil `maintenance` do `docker-compose.coolify.yml`). Toda migration é aplicada à mão, com backup antes, na ordem deste roteiro.

Os comandos abaixo seguem o mesmo padrão do backup que já está em `DEPLOY_COOLIFY.md` (seção 5): rodam **no servidor, na pasta do compose do recurso**.

## 1. Ensaio inicial (fazer uma vez, antes da fase 1)

Objetivo: provar que o procedimento funciona no seu Coolify sem nenhuma migration pendente, para não descobrir o problema no meio de uma fase.

```bash
docker compose -f docker-compose.coolify.yml --profile maintenance run --rm migrate npm run db:migrate
```

- **Esperado:** termina com `Migrations aplicadas.` e código de saída 0, sem alterar nada, porque não há migration pendente.
- **Se falhar:** o erro aparece na própria saída do comando. Provavelmente é o mesmo problema que derrubou o deploy em 30/10, e precisa ser resolvido antes da fase 1. Guarde a mensagem (sem senhas nem URL de conexão).
- **Confirme também** que `SEED_ON_DEPLOY` está `false` no Coolify. O comando acima não semeia, mas o `run --rm migrate` sem argumentos semearia se estivesse `true`.

## 2. Backup (sempre, antes de aplicar)

```bash
docker compose -f docker-compose.coolify.yml --profile maintenance run --rm backup
```

1. Confira que a pasta nova de `backup_storage` tem `database.dump`, `storage.tar.gz` e `SHA256SUMS`.
2. Valide os checksums.
3. Copie a pasta para fora do servidor.

Sem esses três itens, não aplique a migration.

## 3. Ordem entre migration e código

| Tipo | Ordem | Por quê |
|---|---|---|
| **Expandir** (cria tabela ou coluna, aceitando nulo) | 1. migration, 2. deploy do código | O código antigo ignora o que é novo, então os dois lados funcionam durante a troca |
| **Preencher dados** | migration ou script, com o código novo ainda desligado | Permite conferir antes de qualquer uso |
| **Endurecer** (`NOT NULL`, chaves, unicidades) | janela curta, fora do horário de uso | Pode bloquear tabelas por alguns segundos |
| **Contrair** (remove coluna ou tabela antiga) | 1. deploy do código que não usa mais, 2. alguns dias estável, 3. migration | Remover antes quebra o código em produção |

Aplicar a migration:

```bash
docker compose -f docker-compose.coolify.yml --profile maintenance run --rm migrate npm run db:migrate
```

## 4. Conferência depois de migrar

1. A saída terminou com `Migrations aplicadas.`
2. `/api/health` retorna `status: ok` e `database: ok`.
3. O número de linhas em `drizzle.__drizzle_migrations` é igual ao número de migrations em `drizzle/meta/_journal.json`.
4. Venda de teste, entrada de nota e dashboard funcionando.
5. Cada fase do plano acrescenta suas próprias consultas de conferência (por exemplo, na fase 2: nenhuma linha sem `account_id`). Elas serão registradas aqui quando a fase for implementada.

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
- **`SEED_ON_DEPLOY` não tem mais efeito no deploy.** Para criar o primeiro administrador num banco novo, rode o seed manualmente: `docker compose -f docker-compose.coolify.yml --profile maintenance run --rm migrate sh -c "npm run db:migrate && npm run db:seed"`, com as senhas de seed definidas no Coolify.
- **Migrations aplicadas só por este roteiro.** Se alguém aplicar uma por outro caminho, registre aqui a data e o motivo.
