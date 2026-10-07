# Deploy no Coolify

Este projeto usa um stack Docker Compose com aplicação Next.js, migration de execução única, PostgreSQL e dois volumes persistentes.

## 1. Criar o recurso

1. No projeto/ambiente do Coolify, escolha **New Resource** e conecte o repositório Git.
2. Selecione **Docker Compose** como Build Pack.
3. Use `/` como Base Directory e `/docker-compose.coolify.yml` como Docker Compose Location.
4. Não habilite Raw Compose Deployment. Mantenha a injeção de build args habilitada.

## 2. Variáveis

O Coolify gera e persiste automaticamente `SERVICE_PASSWORD_64_POSTGRES` e `SERVICE_REALBASE64_32_NEXT_SERVER_ACTIONS`. A primeira protege o PostgreSQL; a segunda fornece os 32 bytes em Base64 usados para criptografar Server Actions.

Cadastre antes do primeiro deploy:

- `SEED_ON_DEPLOY=true` apenas no primeiro deploy.
- `SEED_ADMIN_EMAIL` e `SEED_OPERATOR_EMAIL`.
- `SEED_ADMIN_PASSWORD` e `SEED_OPERATOR_PASSWORD`, ambas com pelo menos 12 caracteres.
- `SESSION_TTL_HOURS=12`, ou o tempo de sessão desejado.

Após o primeiro deploy bem-sucedido, altere `SEED_ON_DEPLOY` para `false` e faça novo deploy. Assim, migrations continuam automáticas sem redefinir senhas ou dados demonstrativos.

## 3. Domínio

No componente `app`, configure o domínio como `https://pdv.seu-dominio.com:3000`. O sufixo indica ao proxy do Coolify a porta interna; usuários continuam acessando HTTPS normalmente.

Não publique portas para `db` ou `app`. O Compose usa apenas a rede interna do recurso.

## 4. Persistência e backups

- `postgres_data`: dados do PostgreSQL.
- `product_storage`: fotos dos produtos.

Configure um backup PostgreSQL diário, com retenção e cópia S3 externa. Configure também backup periódico do volume `product_storage`. Um volume persistente evita perda em um redeploy, mas não substitui backup. Faça ao menos um teste real de restauração.

## 5. Verificação pós-deploy

1. Confirme que `db` e `app` estão saudáveis e `migrate` terminou com código zero.
2. Acesse `/api/health`; deve retornar `status: ok` e `database: ok`.
3. Entre com o administrador configurado no seed.
4. Faça uma venda de teste, confirme a baixa de estoque e o dashboard.
5. Troque `SEED_ON_DEPLOY` para `false` imediatamente após o bootstrap.

## Rollback e operação

- Não altere a versão principal do PostgreSQL sem backup e procedimento de upgrade.
- Não apague os volumes ao recriar componentes.
- Deploys futuros aplicam migrations antes de liberar a nova aplicação.
- Se o health check falhar, confira primeiro os logs de `migrate`, `db` e `app`.
