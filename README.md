# Coliseu PDV

Sistema de frente de caixa e gestão para uma loja, com múltiplos operadores, estoque transacional, pagamentos divididos, financeiro e créditos de jogadores.

## Funcionalidades

- Contas a pagar e receber com parcelas por prazos em dias (`30/60/90`), vencimentos, liquidações parciais e histórico.
- Registro de forma, data e pessoa relacionada a cada pagamento ou recebimento.
- Cadastro de jogadores e extrato imutável de créditos, aceitando saldo positivo ou negativo.
- Crédito do jogador e pagamento futuro no PDV, inclusive combinados com PIX, dinheiro ou cartões.
- Pagamento futuro gera automaticamente conta a receber e aparece no fluxo financeiro.
- Dashboard separa faturamento de vendas do fluxo de caixa realizado, evitando dupla contagem.
- Distribuição automática de NF-e destinadas ao CNPJ por NSU, usando certificado A1 e o Web Service oficial `NFeDistribuicaoDFe`.
- Armazenamento do XML oficial, normalização de cabeçalho/itens/eventos e consulta no painel administrativo.

## Desenvolvimento

Requisitos: Node.js 20+ e PostgreSQL 17 (ou Docker).

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Acesse `http://localhost:3000`. As contas vêm das variáveis `SEED_ADMIN_*` e `SEED_OPERATOR_*` do `.env`.

O seed cria um catálogo demonstrativo de loja TCG com produtos Magic, Pokémon, acessórios, bebidas e snacks. Os custos e preços são fictícios para desenvolvimento e não representam cotação de mercado.

## Verificação

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Os testes de integração usam `TEST_DATABASE_URL` e exigem um banco vazio próprio. O E2E exige migrations e seed aplicados.

## Integração SEFAZ

A integração consulta a distribuição nacional de DF-e, nunca raspa o portal público. O último NSU e o maior NSU são persistidos em `sefaz_sync_states`; documentos brutos, notas normalizadas, itens e eventos ficam em tabelas fiscais próprias.

Configure as variáveis `SEFAZ_*` descritas em `.env.example`. Para desenvolvimento fora do Docker, prefira `SEFAZ_CERTIFICATE_PATH`. No Coolify, cadastre o PFX em Base64 como variável secreta `SEFAZ_CERTIFICATE_BASE64`. A senha também deve ser secreta e o certificado nunca deve ser versionado.

Teste primeiro com `SEFAZ_ENVIRONMENT=homologation`. Para uma consulta pontual:

```bash
npm run sefaz:sync
```

O serviço `sefaz-worker` executa a sincronização automática e respeita o intervalo mínimo de 60 minutos quando não há novos documentos. A tela fica em `/admin/fiscal`.

## Produção com Docker

Defina `POSTGRES_PASSWORD` e senhas de seed fortes. Depois:

```bash
docker compose build
docker compose up -d
docker compose run --rm migrate npm run db:seed
```

O PostgreSQL e as fotos usam volumes persistentes. Mantenha backup dos volumes `postgres_data` e `product_storage`, publique a aplicação atrás de HTTPS e não exponha a porta do banco fora de uma rede confiável.

### Coolify

Para produção no Coolify, use `docker-compose.coolify.yml` e siga o checklist completo em [DEPLOY_COOLIFY.md](./DEPLOY_COOLIFY.md). O Compose de produção não publica o banco, executa migrations antes da aplicação, possui health check e oferece bootstrap controlado do seed inicial.

## Decisões

- Valores monetários são inteiros em centavos; percentuais usam pontos-base.
- Estoque só muda por serviço transacional e toda mudança cria histórico.
- Checkout bloqueia produtos em ordem determinística com `FOR UPDATE`.
- Itens guardam preço, custo e identidade do produto no momento da venda.
- Cancelamento é integral, preserva pagamentos e devolve estoque.
- Fotos ficam no storage local por adaptador; a chave persistida permite migração futura para S3/MinIO.
