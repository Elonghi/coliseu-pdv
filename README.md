# Coliseu PDV

Sistema de frente de caixa e gestão para uma loja, com múltiplos operadores, estoque transacional, pagamentos divididos, financeiro e créditos de jogadores.

## Funcionalidades

- Abertura e fechamento de caixas por operador, fundo inicial, suprimento, sangria e conferência de diferenças.
- Inventário físico transacional, estoque parado e pedidos de compra com comparação entre pedido e NF-e.
- Catálogo TCG com jogo, coleção, idioma, raridade e condição, além de etiquetas EAN-13 internas imprimíveis.
- Permissões por área, 2FA TOTP opcional, auditoria pesquisável, health check e backup versionado de banco e fotos.
- Baixa individual ou em lote, estorno auditado e conciliação bancária por OFX sem duplicar lançamentos importados.
- Contas a pagar e receber geradas automaticamente pelas operações, com parcelas, vencimentos e histórico em modo somente leitura.
- Cadastro de jogadores e extrato imutável de créditos, aceitando saldo positivo ou negativo.
- Crédito do jogador e pagamento futuro no PDV, inclusive combinados com PIX, dinheiro ou cartões.
- Pagamento futuro gera automaticamente conta a receber e aparece no fluxo financeiro.
- Dashboard separa faturamento de vendas do fluxo de caixa realizado, evitando dupla contagem.
- Distribuição automática de NF-e destinadas ao CNPJ por NSU, usando certificado A1 e o Web Service oficial `NFeDistribuicaoDFe`.
- Armazenamento do XML oficial, normalização de cabeçalho/itens/eventos e consulta no painel administrativo.
- Visão fiscal separada entre notas de entrada e saída pela posição do CNPJ da loja, incluindo resumos distribuídos pela SEFAZ.
- Geração de DANFE em PDF com chave de acesso em código de barras e exportação contábil em ZIP, com XMLs organizados e CSV-resumo.
- Importação retroativa de até 100 XMLs de NF-e por lote, com validação do CNPJ, deduplicação e histórico por arquivo.
- Entrada automática no estoque dos itens de NF-e autorizadas destinadas à loja, incluindo custo médio, quantidade, vínculo por EAN/código do fornecedor e estorno seguro em cancelamentos.
- Menu administrativo responsivo, com barra e grupos recolhíveis, além da escolha individual entre o visual Legado e o visual Novo.

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

## Backup, restauração e monitoramento

O Compose local e o Compose do Coolify possuem o serviço de manutenção `backup`, que gera um dump PostgreSQL em formato customizado, compacta as fotos e grava checksums em um volume separado. Agende no Coolify a execução diária:

```bash
docker compose --profile maintenance run --rm backup
```

Mantenha também uma cópia externa do volume `backup_storage`. Para restaurar, valide `SHA256SUMS`, execute `pg_restore --clean --if-exists --no-owner` contra um banco vazio e extraia `storage.tar.gz` no volume de fotos. Faça um teste de restauração mensal antes de remover backups antigos.

Configure o monitor HTTP do Coolify para `/api/health`. O endpoint verifica banco, escrita no storage, espaço livre e informa o último estado da SEFAZ. Recomenda-se alertar para HTTP diferente de 200, uso de disco, reinícios dos containers e ausência do backup diário.

Na mesma tela, administradores podem importar notas antigas selecionando vários arquivos `.xml`. Cada arquivo pode ter até 5 MB e o lote até 50 MB. A importação aceita NF-e completa (`NFe`/`nfeProc`) pertencente ao CNPJ configurado, preserva o XML original e não altera o último NSU da integração.

Notas completas, autorizadas e destinadas ao CNPJ da loja geram automaticamente as entradas de estoque e as contas a pagar das duplicatas. O produto é localizado pelo mapeamento do fornecedor, EAN, SKU ou nome exato. Quando não existe, é criado inativo com o custo fiscal e deve ter preço/cadastro revisados antes da ativação no PDV. A chave única por item fiscal torna a operação idempotente; reimportar o mesmo XML não soma estoque novamente.

## Produção com Docker

Defina `POSTGRES_PASSWORD` e senhas de seed fortes. Depois:

```bash
docker compose build
docker compose up -d
docker compose run --rm migrate npm run db:seed
```

O PostgreSQL e as fotos usam volumes persistentes. Mantenha backup dos volumes `postgres_data` e `product_storage`, publique a aplicação atrás de HTTPS e não exponha a porta do banco fora de uma rede confiável.

Para reiniciar excepcionalmente todos os dados operacionais em produção, use o terminal do container da aplicação. O comando exclui produtos e suas fotos, pedidos de compra, inventários, sessões de caixa, importações bancárias, mapeamentos de fornecedores, vendas, pagamentos, movimentações de estoque, contas financeiras, movimentos e saldos de crédito dos jogadores e notas/documentos fiscais. Usuários, sessões de autenticação, categorias, unidades, formas de pagamento, jogadores, fornecedores, cadastros de caixa, auditoria, configuração SEFAZ e o último NSU são preservados.

Esta operação é irreversível. Faça backup do PostgreSQL e do volume de fotos antes de executá-la. No terminal do container `app`, rode diretamente o script (a imagem standalone não expõe os scripts do npm):

```bash
CONFIRM_PRODUCTION_RESET=ZERAR_DADOS_OPERACIONAIS node /app/scripts/reset-import-data.mjs
```

Em um checkout local, o equivalente é `CONFIRM_PRODUCTION_RESET=ZERAR_DADOS_OPERACIONAIS npm run db:reset-operational-data`.

### Coolify

Para produção no Coolify, use `docker-compose.coolify.yml` e siga o checklist completo em [DEPLOY_COOLIFY.md](./DEPLOY_COOLIFY.md). O Compose de produção não publica o banco, executa migrations antes da aplicação, possui health check e oferece bootstrap controlado do seed inicial.

## Decisões

- Valores monetários são inteiros em centavos; percentuais usam pontos-base.
- Estoque só muda por serviço transacional e toda mudança cria histórico.
- Checkout bloqueia produtos em ordem determinística com `FOR UPDATE`.
- Itens guardam preço, custo e identidade do produto no momento da venda.
- Cancelamento é integral, preserva pagamentos e devolve estoque.
- Fotos ficam no storage local por adaptador; a chave persistida permite migração futura para S3/MinIO.
