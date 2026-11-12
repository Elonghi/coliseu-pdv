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

### 0015 `dados_por_loja` (separação dos dados por lojista e por loja, etapa 1)

Acrescenta `store_id` às 24 tabelas de loja (vendas, caixa, estoque, financeiro, fiscal), `account_id` e `store_id` opcional às 5 compartilháveis (categorias, produtos, vínculos de fornecedor, fornecedores, jogadores) e conta e loja opcionais à auditoria. Cria as funções `app_current_account()` e `app_current_store()`. Todas as linhas que já existem recebem a loja e o lojista atuais. O app em produção não usa as colunas ainda; elas se preenchem sozinhas, então ele continua igual.

**Janela:** a migration altera cerca de 30 tabelas numa transação e pede travas curtas. Aplique fora do horário de uso, com o backup feito, e só depois de a imagem nova estar no ar.

Depois de aplicar, no terminal do app (só lê):

```bash
node -e 'const pg=require("pg");(async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();const T=["sales","sale_items","payments","stock_movements","cash_sessions","financial_accounts","fiscal_invoices","purchase_orders","inventory_counts"];for(const t of T){const r=(await c.query(`SELECT count(*)::int total, count(*) FILTER (WHERE store_id IS NULL)::int sem_loja FROM ${t}`)).rows[0];console.log(t.padEnd(20),"linhas:",String(r.total).padStart(7),"| sem loja:",r.sem_loja)}for(const t of ["products","categories","suppliers","players"]){const r=(await c.query(`SELECT count(*)::int total, count(*) FILTER (WHERE account_id IS NULL)::int sem_lojista FROM ${t}`)).rows[0];console.log(t.padEnd(20),"linhas:",String(r.total).padStart(7),"| sem lojista:",r.sem_lojista)}await c.end()})()'
```

Esperado: **`sem loja` e `sem lojista` iguais a 0 em todas as linhas**, e o total de cada tabela igual ao de antes da migration. Se algum vier maior que zero, pare e me avise.

**Regra nova do banco, importante:** enquanto existir **uma única loja**, tudo grava nela sozinho. Se uma **segunda loja** (ou um segundo lojista) for criada **antes** do código passar a escolher a loja ativa, as gravações de venda, caixa, estoque etc. **falham de propósito**, em vez de misturar dados. Não crie uma segunda loja ou outro lojista antes dessa etapa do código.

Volta atrás: a migration só acrescenta, então redeployar o commit anterior basta (o código antigo ignora as colunas). Para remover as colunas, restaure o backup.

### 0016 `estoque_por_loja`, 0017 `endurecimento_e_plataforma` e 0018 `travas_no_banco` (lançamento do multi-lojista)

Aplicam-se juntas, com um só `node scripts/migrate.mjs --apply` (é tudo numa transação: se algo falhar, nada é gravado).

- **0016:** cria `product_stock` (saldo e custo médio por loja e produto), copia o estoque atual para a loja existente e liga gatilhos que mantêm `products.stock_quantity` como o total (scripts antigos e volta de versão continuam coerentes).
- **0017:** unicidade de SKU, código de barras, categoria e fornecedor **por lojista**; nome do caixa por loja; formas de pagamento por loja (`store_payment_methods`); 26 gatilhos que recusam registro ligado a outra loja; `users.is_platform_admin`; `accounts.max_stores`.
- **0018:** liga o RLS (travas do banco) em todas as tabelas de lojista, loja e identidade.

**Janela:** a 0017 e a 0018 mexem em muitas tabelas. Aplique fora do horário de uso, com o backup feito e **depois** de a imagem nova estar no ar. Entre o deploy e a migration, quem entra no sistema vê o aviso "Atualização do sistema em andamento"; o administrador do sistema vê o comando para aplicar.

Depois de aplicar, no terminal do app (só lê):

```bash
node -e 'const pg=require("pg");(async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();const q=async(s)=>(await c.query(s)).rows[0];const a=await q("SELECT COALESCE(sum(stock_quantity),0)::int total, count(*)::int produtos FROM products");const b=await q("SELECT COALESCE(sum(quantity),0)::int total, count(*)::int linhas, count(DISTINCT store_id)::int lojas FROM product_stock");const m=await q("SELECT (SELECT count(*) FROM store_payment_methods)::int formas_por_loja, ((SELECT count(*) FROM stores)*(SELECT count(*) FROM payment_methods))::int esperado");const t=await q("SELECT count(*)::int tabelas_sem_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\x27public\x27 AND c.relkind=\x27r\x27 AND NOT c.relrowsecurity AND c.relname IN (\x27sales\x27,\x27products\x27,\x27users\x27,\x27cash_registers\x27,\x27product_stock\x27,\x27audit_logs\x27)");console.log("produtos (total antigo):",JSON.stringify(a));console.log("estoque por loja:       ",JSON.stringify(b));console.log("formas de pagamento:    ",JSON.stringify(m));console.log("tabelas sem RLS:        ",JSON.stringify(t));await c.end()})()'
```

Esperado: o `total` de `produtos (total antigo)` igual ao de `estoque por loja`; `formas de pagamento` com os dois números iguais; `tabelas sem RLS` igual a 0. É normal haver menos `linhas` do que `produtos`: produto sem estoque não precisa de linha.

Também confira `/api/health`: deve trazer `"migrations": {"pending": false}`.

Volta atrás: o app antigo continua funcionando com o banco novo (as colunas antigas seguem coerentes). Para desfazer a migration, restaure o backup.

### 0019 `produtos_por_loja` (cada loja com os seus produtos)

Cada produto passa a ter uma **loja dona** (`products.store_id`, preenchida na criação com a loja ativa). A lista de produtos, o estoque, a abertura de box, o PDV e as notas de uma loja só enxergam os produtos dela. Por isso:

- a unicidade de SKU e de código de barras passa a valer **por loja** (a mesma loja não repete, lojas diferentes podem usar o mesmo SKU);
- o vínculo fornecedor-produto também é por loja, e a entrada de nota cria o produto na loja da nota;
- gatilhos impedem que saldo, movimento, venda, compra, nota, inventário ou abertura de box liguem uma loja ao produto de outra;
- **produtos que já existem**: lojista com **uma loja só** leva todos os produtos para ela (uma loja criada depois começa com o catálogo vazio). Lojista com **várias** lojas: cada produto vai para a loja que o usa (saldo, movimento, venda, compra, nota, inventário ou vínculo). Se várias lojas já o usam, ou nenhuma, ele continua **compartilhado** e aparece com a etiqueta "Compartilhado entre as lojas". Nada some de uma loja que já usava o produto.

**Ordem, ao contrário da regra geral (seção 3):** envie o **código primeiro** e aplique a migration **depois**. A migration troca o índice único que o código antigo usa na entrada de nota (`ON CONFLICT`); com o código antigo e o banco novo, a entrada de nota falha. O código novo funciona com o banco antes e depois da migration; no intervalo, produtos criados nascem sem loja e a migration os ajusta (no lojista de uma loja só, vão para ela).

**Janela:** curta (recria três índices e atualiza `products`). Faça com o backup feito, de preferência fora do horário de uso.

Depois de aplicar, no banco:

```sql
SELECT a.name AS lojista, (SELECT count(*) FROM stores s WHERE s.account_id=a.id) AS lojas,
       count(*) AS produtos, count(*) FILTER (WHERE p.store_id IS NULL) AS compartilhados
FROM products p JOIN accounts a ON a.id=p.account_id GROUP BY a.id, a.name ORDER BY 1;
```

Esperado: lojista com **uma loja** com `compartilhados` = 0. Lojista com várias lojas: só os produtos usados por mais de uma loja ficam compartilhados. Confira também `/api/health` (`"migrations": {"pending": false}`) e abra Produtos em cada loja pelo seletor.

Volta atrás: a migration **altera dados** (loja dos produtos) e remove índices. Restaure o backup (seção 5); não volte só o código.

## 9. Ativar o isolamento entre lojistas (papel de banco sem privilégio)

As travas do banco (RLS) já existem depois da 0018, mas **só valem para um usuário de banco que não seja superusuário**. O compose cria o usuário do Postgres como superusuário, então, até este passo, o app ignora as travas. Por isso o painel do sistema **recusa criar o segundo lojista ou a segunda loja** enquanto o isolamento não estiver ativo.

1. No Coolify, cadastre a variável secreta `APP_DB_PASSWORD` (24+ caracteres, sem espaços; por exemplo `openssl rand -base64 36`) e faça um deploy para ela chegar ao app. Nunca coloque essa senha no Git, em chat ou em chamado.
2. No terminal do app, crie o papel (usa o usuário dono do banco, que continua em `DATABASE_URL`):

```bash
node scripts/create-app-role.mjs
```

3. No Coolify, cadastre `APP_DATABASE_URL` com a URL do papel novo: `postgresql://coliseu_app:<APP_DB_PASSWORD>@db:5432/coliseu` (caracteres especiais da senha precisam ir codificados na URL). Faça outro deploy.
4. Confira em `/api/health` (`"isolation": {"enforced": true}`) e no painel do sistema: o cartão "Saúde do sistema" deve dizer **"Isolamento entre lojistas no banco: ativo"**.

`DATABASE_URL` continua sendo o dono do banco e serve às migrations, aos scripts e ao worker. Só o app web usa `APP_DATABASE_URL`. Se algo der errado, apague `APP_DATABASE_URL` no Coolify e faça deploy: o app volta a conectar como antes.

## 10. Painel do administrador do sistema

É a área onde você, dono do sistema, cria lojistas, adiciona lojas e suspende contas. Fica em `/plataforma`. Quem a usa **não enxerga vendas, estoque, caixa, financeiro nem notas dos lojistas**, só contas, lojas e equipes.

1. Dê o acesso à sua pessoa (já cadastrada como usuário), no terminal do app. Sem `--apply` só simula:

```bash
node scripts/platform-admin.mjs --email=seu@email.com
node scripts/platform-admin.mjs --email=seu@email.com --apply
```

2. Entre de novo no sistema. Você passa a ver o link **Painel do sistema** no menu (se também for lojista) e o login te leva a `/plataforma` (se não pertencer a nenhum lojista).
3. **Novo lojista:** nome do cliente, limite de lojas (opcional), primeira loja (nome e CNPJ opcional) e o titular (nome, e-mail e senha provisória). O titular vê todas as lojas dele e cadastra a própria equipe.
4. **Adicionar loja:** dentro do lojista, respeitando o limite. O CNPJ da loja faz as notas fiscais emitidas para ele entrarem nessa loja.
5. **Suspender:** ninguém do lojista entra até a reativação, e as sessões abertas caem. Os dados ficam guardados.
6. **Senha do titular:** define uma senha provisória, desliga o 2FA dele e derruba as sessões.

**Fiscal (SEFAZ):** a integração é configurada por um CNPJ no ambiente. O worker grava as notas na loja com esse CNPJ; sem CNPJ cadastrado, na única loja do sistema. Com várias lojas e sem o CNPJ cadastrado, o worker **não sincroniza** (e avisa no log) em vez de gravar na loja errada.

**Scripts de reset** (`reset-import-data.mjs` e `reset-to-invoice-entry.mjs`) apagam os dados de todos os lojistas: por isso **se recusam a rodar** quando existe mais de um lojista.

## 11. Ordem recomendada do lançamento

1. Backup (seção 2).
2. Enviar o código; esperar o deploy; abrir um terminal novo no app.
3. `node scripts/migrate.mjs` (consulta) e, se mostrar 0016, 0017 e 0018 pendentes, `node scripts/migrate.mjs --apply` fora do horário de uso.
4. Conferir (seção 8) e `/api/health`.
5. Dar o acesso de administrador do sistema à sua pessoa (seção 10).
6. Ativar o isolamento (seção 9).
7. Só então criar o segundo lojista pelo painel do sistema.

## 12. Seu usuário de administrador do sistema e o cliente de demonstração

### 12.1 Criar o seu usuário de administrador do sistema

Serve para quem ainda não tem um acesso ao painel `/plataforma`. O usuário criado **não pertence a nenhum lojista**: ao entrar, cai direto no painel do sistema, sem ver vendas nem estoque de ninguém. No terminal do app, depois das migrations (seção 8):

```bash
node scripts/platform-admin.mjs --email=voce@empresa.com --create --name="Seu Nome"
```

Sem `--apply`, só mostra o que faria. Para criar, informe a sua senha **por variável de ambiente** (assim ela não fica no histórico do comando nem na tela). Troque o e-mail, o nome e a senha pelos seus:

```bash
PLATFORM_ADMIN_PASSWORD='uma senha sua com 10 ou mais caracteres' node scripts/platform-admin.mjs --email=voce@empresa.com --create --name="Seu Nome" --apply
```

Se preferir que o sistema gere a senha, rode sem `PLATFORM_ADMIN_PASSWORD`: o script gera uma senha forte e a mostra **uma única vez**.

- **Esqueceu a senha?** `node scripts/platform-admin.mjs --email=voce@empresa.com --reset-password --apply` (também aceita `PLATFORM_ADMIN_PASSWORD`). Encerra as sessões abertas.
- **Já existe um usuário e você quer só dar o acesso a ele** (por exemplo, o titular da sua loja): `node scripts/platform-admin.mjs --email=ele@empresa.com --apply`. Ele passa a ter o link "Painel do sistema" no menu, além da loja.
- O script também funciona sem o painel estar pronto: ele só precisa das migrations aplicadas.

### 12.2 Cliente de demonstração, para apresentações

Cria um lojista **fictício e completo**, para você apresentar o sistema sem usar dados de cliente real. Pelo painel do sistema, botão **Cliente de demonstração**: informe o nome, o e-mail do titular e uma senha (a mesma vale para todos os acessos). Leva alguns segundos.

**Pré-requisito:** o isolamento do banco ativo (seção 9). A demonstração é um segundo lojista no mesmo banco, e o painel recusa criá-lo enquanto as travas não valem, para ela nunca enxergar os dados do cliente real.

O que é criado, tudo fictício (nomes inventados, CNPJs de faixa fictícia, e-mails de exemplo):

- **Duas lojas** (Centro e Shopping) e **quatro acessos**, todos com a mesma senha:
  - o **titular** (o e-mail que você informou): vê as duas lojas, o seletor "Todas as lojas" e o quadro "Por loja" no painel;
  - o **gerente da Shopping** (`seu-email+gerente-shopping@dominio`): administrador, mas só da Shopping, para mostrar a diferença para o lojista;
  - um **caixa por loja** (`+caixa-centro` e `+caixa-shopping`): entram direto no PDV.
- **Produtos de cada loja** (31 na Centro e uma seleção menor na Shopping, que não trabalha com cartas avulsas), em 5 categorias (Magic, Pokémon, Yu-Gi-Oh!, acessórios, bebidas e snacks), todos com **código de barras EAN-13 válido**, prontos para as **etiquetas**, com caixas e boosters para mostrar a abertura de box.
- **Notas fiscais de compra**, três por loja: uma com entrada completa no estoque, uma com **falta registrada** na conferência e uma **ainda por dar entrada**, para mostrar o fluxo de recebimento.
- **Financeiro:** 10 duplicatas a pagar das notas (2 já pagas, algumas vencidas e outras a vencer) e **recebíveis** das vendas no fiado.
- **150 vendas em quatro semanas**, feitas pelo mesmo serviço do PDV, com PIX, dinheiro, cartão, crédito do jogador, pagamento dividido e fiado, 4 vendas canceladas e um caixa aberto por loja. Os gráficos do painel já aparecem preenchidos.
- 8 jogadores (3 com crédito), 2 fornecedores e 1 pedido de compra enviado por loja.

**Depois de apresentar:** não há botão para apagar a demonstração (isso exigiria apagar dados de dezenas de tabelas). Suspenda o lojista em `/plataforma` (ninguém dele entra mais) e, para a próxima apresentação, crie outra demonstração com **outro e-mail de titular**. Podem existir várias ao mesmo tempo.

Em desenvolvimento (ou pelo serviço `migrate` do compose, que tem `tsx`), o mesmo cliente é criado por comando: `npm run db:seed-demo` (variáveis `DEMO_OWNER_EMAIL` e `DEMO_PASSWORD`; com o banco de desenvolvimento, que roda sem as travas, é preciso `DEMO_SKIP_ISOLATION_CHECK=true`).

## 13. Primeiro acesso do lojista: acesso guiado

Quando você cria um lojista novo (seção 10), o titular entra num sistema vazio. No **primeiro acesso** o sistema dá as boas-vindas e **conduz a pessoa pela tela real**, em seis passos até a primeira venda: **categoria, primeiro produto, estoque, caixa, abertura do caixa e venda no PDV**.

Como funciona: um balão aponta o elemento certo (o item do menu, o botão, o campo ainda vazio, o botão de salvar) e diz o que fazer; o elemento ganha um anel verde e o resto da tela escurece, **sem bloquear cliques**. Ao concluir uma ação, o guia passa sozinho para a próxima. Dentro de um modal (novo caixa, abrir caixa) o balão aparece como uma faixa no próprio modal. No celular o balão fica fixo na base e aponta o botão do menu. Ao terminar, uma tela de parabéns encerra o guia.

- **Para quem aparece:** administradores de um lojista, no painel da loja e no PDV (não no painel do sistema). Operador de caixa vai direto ao PDV e não vê o guia.
- **Só quando há o que guiar:** na primeira visita o guia confere o andamento. Quem já tem a loja rodando (categoria, produto, estoque, caixa, caixa aberto e venda), como o cliente de demonstração e a conta já em uso, **não vê boas-vindas nem balões**.
- **Por loja:** o andamento é conferido na loja ativa. Lojista com várias lojas, na visão de "Todas as lojas", é orientado a escolher uma loja primeiro, porque produto, estoque e caixa são de cada loja.
- **Sair e voltar:** "Sair do guia" (no balão) pausa; o Dashboard mostra o cartão "Acesso guiado pausado" com o botão para retomar, e a página **Primeiros passos** (menu Visão geral) lista os seis passos e tem o botão de iniciar ou retomar. Nessa página ficam também os passos opcionais depois do básico (equipe, nota fiscal, etiquetas e 2FA).
- **Sem migration:** nada novo no banco. O andamento vem dos dados que já existem, consultados em `/api/guide`. A decisão de sair ou de já ter visto as boas-vindas fica num cookie do navegador, um por usuário; em outro navegador as boas-vindas aparecem de novo enquanto a loja não estiver pronta.
- **Apresentações:** o cliente de demonstração (seção 12.2) já nasce com os seis passos feitos, então não mostra o guia. Para mostrar o acesso guiado numa apresentação, crie um **lojista novo** pelo painel do sistema.
