# Plano de migração: multi-conta e multi-loja

Estado: **implementado** (ver a seção 13). O roteiro de lançamento está em `docs/RUNBOOK_MIGRACAO.md`, seções 8 a 11.
Base de análise: 37 tabelas, cerca de 387 consultas SQL em 50 arquivos, `products.stock_quantity` usado em 59 pontos de 13 arquivos, configuração fiscal (CNPJ e certificado) lida de variáveis de ambiente.

## Vocabulário (use sempre estes termos)

| Termo | O que é | No banco |
|---|---|---|
| **Plataforma** | O dono do sistema. Vende o Coliseon para lojistas e administra todos eles. | fora das tabelas de cliente (painel da plataforma, a construir) |
| **Lojista** | O **cliente que contrata** o sistema. É a unidade de isolamento (multi-tenant): nunca enxerga dados de outro lojista. Tem N lojas. | `accounts`; o usuário titular tem `users.is_account_owner` |
| **Loja** | Cada ponto de venda de um lojista. | `stores` |
| **Equipe** | Administradores de loja e operadores do lojista. | `users` com `account_id` e vínculos em `user_stores` |

O lojista tem duas visões: **uma loja específica** e **todas as lojas** (resumo consolidado). Neste documento, "conta" e "proprietário" querem dizer **lojista** (a palavra "contas" também aparece no financeiro, onde são contas a pagar e a receber).

## 1. Regras fechadas

1. O sistema é vendido a **vários usuários** (lojistas). Cada usuário que contrata é o **proprietário** de uma **conta do proprietário**, que é a fronteira de isolamento: tudo o que ele e a equipe dele criam pertence a essa conta, e uma conta nunca enxerga dados de outra. Tudo roda no mesmo servidor e no mesmo banco. Não existe cadastro separado de "organização" ou "empresa": a conta nasce junto com o usuário proprietário. (Neste documento "conta" sempre quer dizer isso, e não as contas a pagar e a receber do financeiro.)
2. Cada proprietário tem **N lojas**, sem limite fixo, cadastradas por ele mesmo na tela. O limite pode virar item de plano.
3. Cada loja se comporta como um **cliente independente**: catálogo, jogadores, fornecedores, estoque, caixa, financeiro e fiscal próprios, com CNPJ e certificado próprios.
4. O proprietário pode **compartilhar** catálogo, fornecedores e jogadores entre as lojas dele. Quem decide é ele.
5. O proprietário enxerga todas as lojas, pode editar uma loja ou **aplicar a mesma alteração em várias** a partir da tela de administrador.
6. Existe **transferência interna de estoque** entre lojas da mesma conta, feita **somente pelo proprietário**, para corrigir lançamentos errados.
7. O e-mail do usuário continua único no sistema inteiro, e o login não muda: o usuário entra e já cai na conta dele. Uma pessoa pertence a uma conta só.

## 2. Papéis

| Papel | Alcance |
|---|---|
| **Proprietário** | Todas as lojas da conta. Cria lojas, compartilha dados, transfere estoque, vincula usuários, aplica alterações em várias lojas. |
| **Administrador de loja** | Somente as lojas liberadas a ele, com as permissões que já existem hoje. Não transfere estoque nem compartilha. |
| **Operador** | Como hoje, restrito às lojas liberadas. |

O proprietário cadastra as próprias lojas e os próprios funcionários (administradores de loja e operadores) na tela. Cada loja nova nasce com o conjunto padrão (formas de pagamento, caixa e contadores).

A criação de uma conta nova, ou seja, de um novo proprietário, é feita no início por script (`create-account`), a partir do que foi vendido. Cadastro com contratação direta pelo site (autoatendimento) e planos com cobrança ficam para a fase 7, e dependem do que for decidido sobre planos.

## 3. Onde cada dado passa a morar

| Nível | Tabelas |
|---|---|
| **Conta** | `accounts`, usuários, permissões, vínculos usuário-loja, configuração de compartilhamento, auditoria |
| **Compartilhável** (dono: loja, ou "sem loja" = compartilhado) | produtos, categorias, vínculos fornecedor-produto, fornecedores, jogadores e saldo de crédito |
| **Sempre da loja** | estoque (`product_stock`), movimentações, transferências, caixas e sessões, vendas e itens, pagamentos, aberturas de box, inventários, compras, financeiro (contas, parcelas, liquidações), extratos bancários, formas de pagamento, notas fiscais, configuração fiscal |
| **Novas** | `accounts`, `stores`, `user_stores`, `sharing_settings`, `product_stock`, `stock_transfers`, `store_counters`, `store_fiscal_settings` |

Decisões de estrutura:

- **Colunas por nível** (decidido ao implementar a etapa 1): tabela **de loja** tem só `store_id` (a conta se obtém pela loja); tabela **compartilhável** tem `account_id` e `store_id` opcional; tabela de **conta** (usuários, auditoria) tem `account_id` opcional até o endurecimento. A consistência entre tabelas pai e filha (item de venda na mesma loja da venda) entra no endurecimento, com chave composta.
- **Padrão calculado pelo banco:** cada coluna nova tem como padrão `app_current_store()` / `app_current_account()`: o valor de `app.store_id` / `app.account_id` da sessão ou, enquanto existir uma única loja (ou conta), essa única. O código atual segue funcionando sem mudar, e uma segunda loja criada antes do código escolher a loja ativa faz a gravação **falhar** em vez de misturar dados.
- **Estoque e custo médio por loja** (`product_stock`). Os 59 pontos que leem `products.stock_quantity` passam a ler dali.
- **Numeração** de vendas e pedidos de compra sequencial por loja, com contador próprio (`store_counters`). O id interno continua existindo.
- **Unicidade** de SKU, código de barras e nome vale por escopo: entre os itens compartilhados e, separadamente, entre os da loja. Ao compartilhar, o sistema checa conflitos.
- **Formas de pagamento:** cada loja nasce com o conjunto padrão.
- **Fotos:** novas em `accounts/<conta>/products/`. As atuais mantêm a chave antiga, e a rota de download confere o dono antes de servir.

## 4. Compartilhamento

- O proprietário liga ou desliga, por tipo (catálogo, fornecedores, jogadores).
- Ligado, o que for cadastrado dali em diante já nasce compartilhado, inclusive produtos criados pela entrada de nota.
- Para o que já existe, o proprietário compartilha item a item ou em lote. Conflitos (mesmo SKU ou código de barras nas duas lojas) aparecem numa tela, onde ele escolhe **unir** os cadastros (o histórico de cada loja é reapontado para o produto unificado) ou **manter separados**.
- Item compartilhado é editado uma vez e vale para todas as lojas que o enxergam.
- Jogador compartilhado compartilha o saldo de crédito. Cada movimento guarda a loja onde ocorreu.
- **Versão 1:** compartilhar e unir. **Separar de novo** (clonar e reapontar por loja) fica para uma etapa posterior.

## 5. Transferência interna de estoque

Objetivo: corrigir produto lançado na loja errada e mover saldo entre lojas da mesma conta.

- **Quem faz:** somente o proprietário.
- **Tela:** Estoque, "Transferir entre lojas". O proprietário escolhe loja de origem, produto, quantidade e loja de destino.
- **Produto no destino:** se o catálogo é compartilhado, é o mesmo produto. Se não, o sistema sugere o equivalente (código de barras ou SKU) ou cria uma cópia na loja de destino.
- **Motivo:** obrigatório.
- **Confirmação:** o modal mostra o saldo antes e depois nas duas lojas.
- **Registro:** `stock_transfers` e duas movimentações ligadas (`TRANSFER_OUT` na origem, `TRANSFER_IN` no destino), numa só transação, bloqueando as duas linhas de estoque em ordem fixa para evitar deadlock.
- **Custo:** o custo médio do destino é recalculado com o custo da origem.
- **Validações:** origem e destino na mesma conta, saldo suficiente, quantidade positiva.
- **Estorno:** o proprietário desfaz com uma transferência inversa ligada à original, desde que o destino ainda tenha o saldo.
- **Auditoria:** cada transferência e estorno ficam registrados.
- **Fiscal:** é um ajuste interno do sistema, **não emite documento fiscal**. Se a movimentação representa mercadoria que realmente trocou de CNPJ, a nota de transferência continua sendo responsabilidade fora do sistema.

## 6. Tela do proprietário

- **Seletor no topo:** "Todas as lojas", uma loja específica ou um conjunto. Com muitas lojas, o seletor tem busca.
- **Visão consolidada:** é a mesma consulta com várias lojas na lista, não um código à parte. Início, vendas, financeiro, estoque e caixa mostram total e divisão por loja. Com muitas lojas a divisão aparece em linhas e ordenação, nunca em colunas por loja.
- **Edição unitária:** em qualquer linha, na loja daquela linha.
- **Edição em várias lojas:** formulários de cadastro ganham "Aplicar em" com seleção de lojas e "selecionar todas". Vale para preço, ativar ou desativar produto, categorias, formas de pagamento, fornecedores, usuários e permissões, e caixas. A gravação é uma transação única, e a auditoria registra uma linha por loja afetada, ligadas por um identificador de lote.
- **Fatos operacionais** (lançar estoque, baixar duplicata, abrir caixa) sempre exigem uma loja definida.

## 6.1 Como a loja ativa funciona (implementado)

- Cada pessoa tem uma **loja ativa**, guardada num cookie (`coliseu_store`) e validada contra as lojas a que ela tem acesso. Com uma loja só, é sempre ela. Com várias, vale a escolhida; sem escolha, vale a visão **Todas as lojas**, que só lê.
- O `pool` do banco (`src/db/index.ts`) aplica, em cada uso, o lojista e a loja da requisição (`app.account_id`, `app.store_id`, `app.store_ids`), e devolve a conexão sempre limpa ao pool. Os 46 arquivos que usam o `pool` não mudaram. Custo medido: cerca de 0,5 ms a mais por consulta, em banco local.
- As colunas `store_id` e `account_id` têm como padrão esses valores, então a gravação cai na loja ativa sozinha. Na visão de todas as lojas, ou sem escopo e com mais de uma loja, a gravação **falha** e a tela orienta a escolher uma loja.
- Fora de uma requisição (worker, scripts, testes) não há escopo, a não ser que o código o defina com `runWithScope`.

## 7. Isolamento

- **RLS no Postgres em dois níveis.** A conta é a fronteira rígida (`app.account_id`). Dentro dela, as lojas que o usuário pode ver (`app.store_ids`).
- **Papel de banco sem privilégio.** Hoje o usuário do banco é superusuário no container do Postgres, e superusuário ignora RLS. O app passa a usar o papel `coliseu_app`, e o dono do esquema fica só para as migrações. Isso altera o `docker-compose.coolify.yml` e as variáveis de ambiente.
- **Camada de escopo no código** (`withScope`): abre a transação, define os parâmetros de sessão e executa. As 387 consultas migram por módulo.
- **Fail-safe:** com RLS ligado, uma consulta que esqueça o filtro não vê nada, em vez de vazar.
- **Durante a obra:** as políticas ficam criadas e desligadas e só são ligadas na fase 5.

## 8. Fiscal por loja

- A configuração (CNPJ, UF, ambiente, certificado e senha) sai das variáveis de ambiente e vai para `store_fiscal_settings`, com certificado e senha **criptografados** por chave própria da aplicação.
- Nunca logar certificado ou senha. A senha do certificado é digitada na tela, nunca passada em conversa, chamado ou commit.
- O worker percorre as lojas ativas, respeitando `next_sync_at` e o limite de consumo da SEFAZ por CNPJ.
- A nota é direcionada sozinha para a loja cujo CNPJ bate com o destinatário. Nota de CNPJ desconhecido fica sem loja, para triagem.
- O `/api/health` passa a resumir todas as lojas.
- O trabalho do SAE NFC-e que está em andamento precisa estar fechado antes, e suas tabelas também ganham `store_id`.
- Duas lojas com o mesmo CNPJ ficam fora da versão 1.

## 9. Fases

Cada fase é um deploy independente e reversível. Como o deploy não roda mais as migrações, cada migração é aplicada à mão, com backup antes (`scripts/backup.sh`).

**Fase 0. Preparação, sem mudar comportamento**
- Entregue:
  - Manifesto `src/db/tenancy.ts` que classifica cada tabela (conta, compartilhável, loja ou global), com teste que falha se uma tabela nova ficar sem classificação.
  - Script `scripts/create-app-role.mjs` (papel `coliseu_app`, sem superusuário e sem ignorar RLS), com teste de integração. O compose só repassa as variáveis ao serviço `migrate`; o app continua no usuário atual até a fase 5.
  - Roteiro de migração em produção: `docs/RUNBOOK_MIGRACAO.md`.
- Pendente de você:
  - Fechar e implantar o SAE NFC-e (migração 0014), que está em andamento na sua máquina. Precisa estar na `main` antes da fase 1, para a numeração das migrations não conflitar.
  - Rodar o ensaio do roteiro (seção 1) e criar o papel (seção 6) no seu Coolify.
- A bateria de **isolamento** propriamente dita (conta A não lê a B) só pode existir a partir da fase 1, quando as colunas `account_id` e `store_id` passam a existir.

**Fase 1. Expandir o esquema**
- Criar as tabelas novas.
- Adicionar `account_id` e `store_id` aceitando nulo.
- Novos valores de enum para as movimentações de transferência.
- O app continua funcionando igual.

**Fase 2. Preencher os dados atuais**
- Criar a conta do proprietário atual, com uma loja inicial chamada "Loja principal" (o proprietário renomeia depois na tela).
- Preencher `account_id` e `store_id` em todas as linhas.
- Copiar o estoque para `product_stock`.
- Semear os contadores e levar a configuração fiscal para a loja.
- Rodar consultas de conferência (zero linhas sem dono).

**Fase 3. Endurecer**
- `NOT NULL`, chaves compostas, unicidades por escopo e índices por loja e data.
- Rodar fora do horário de uso.

**Fase 4. Código do app, em fatias com testes**
- a. Sessão, camada de escopo, papéis e seletor de loja
- b. Catálogo e estoque (`product_stock`)
- c. Caixa, vendas e PDV
- d. Financeiro e extratos
- e. Fiscal por loja, worker e health
- f. Jogadores e auditoria
- g. Cadastro de lojas e vínculo de usuários
- h. Compartilhamento e tela de conflitos
- i. "Aplicar nas lojas selecionadas"
- j. Transferência de estoque
- k. Visões consolidadas
- l. Fotos por conta

**Fase 5. Contrair e travar**
- Remover `products.stock_quantity`, só depois de alguns dias estável.
- Ligar o RLS (`FORCE`) e trocar o app para o papel restrito.
- Desligar a configuração fiscal por variável de ambiente.

**Fase 6. Mais lojas e mais contas**
- Criar lojas novas pela tela do proprietário.
- Criar uma conta nova (outro proprietário) por script.
- Rodar os testes de isolamento com duas contas.
- Atualizar `README.md` e `DEPLOY_COOLIFY.md`.

**Fase 7. Opcional**
- Contratação direta pelo site (cadastro do novo proprietário) e cobrança por plano.
- Painel da plataforma.
- Separar itens compartilhados.
- Preço por loja.
- Limite de lojas por plano.

## 10. Riscos

| Risco | Tratamento |
|---|---|
| Vazamento entre contas | RLS, chave composta, testes automáticos em toda tabela, revisão de cada consulta |
| Scripts de reset (`reset-import-data.mjs`, `reset-to-invoice-entry.mjs`) apagam tudo de todas as lojas e contas | Passam a exigir `--conta` e `--loja`, ou ficam bloqueados quando houver mais de uma conta. **Obrigatório antes da fase 6** |
| Unir cadastros no compartilhamento | Reapontar histórico dentro de uma transação, com simulação antes de aplicar |
| Gravar em várias lojas | Transação única e auditoria por loja |
| Muitas lojas por proprietário | Índices por loja e data, medição antes e depois, resumo em linhas e não em colunas |
| Certificados fiscais | Criptografia, sem log, alinhar com a TI |
| Dados pessoais de jogadores | Isolamento por conta e por loja, tratado como ponto de governança |
| Venda concorrente | Contador por loja serializa a criação de vendas, com teste de concorrência |
| Migração em produção sem migrate automático | Roteiro com backup, conferência e plano de volta por fase |
| Troca de papéis (`ADMIN` x `OWNER`) | Revisar todas as verificações de papel no código |

## 11. Testes

- Isolamento: para cada tabela, a conta A não lê nem grava dados da B. Para cada tabela de loja, um operador não vê loja não liberada.
- Estoque por loja em venda, cancelamento, inventário e entrada fiscal.
- Numeração por loja com vendas concorrentes.
- Entrada de nota na loja do CNPJ correto.
- Compartilhar, unir e conflito de SKU.
- "Aplicar nas lojas" com falha em uma loja desfaz todas.
- Transferência: permissão só do proprietário, saldo insuficiente, estorno, concorrência com venda.
- Total consolidado igual à soma das lojas.
- Os 60 testes atuais passam com as fixtures migradas.
- e2e: troca de loja, visão consolidada, transferência.

## 12. Pendências

Para a fase 2 (migrar a operação que existe hoje):

- Assumido: a operação atual vira a conta de um proprietário, com a "Loja principal". O proprietário será o **administrador mais antigo** do sistema, e os demais administradores viram administradores de loja. Confirmar quem deve ser o proprietário antes de aplicar.
- Se existe limite de lojas por plano, e qual. Enquanto não houver, não há limite.

Assumido por padrão, ajustável:

- Preço de venda único no item compartilhado.
- Custo médio por loja.
- Crédito do jogador compartilhado vale em todas as lojas da conta.
- Criação de novas contas por script no início, sem tela de plataforma e sem cadastro pelo site.

## 13. Estado da implementação

| Parte | Situação |
|---|---|
| Lojista, lojas, equipe e acesso por loja | Pronto (migration 0014) |
| Colunas de loja e lojista nas tabelas, com padrão do banco | Pronto (0015) |
| Loja ativa na sessão e no banco, seletor, visão "Todas as lojas" | Pronto (sem migration) |
| Estoque por loja (`product_stock`), custo médio por loja | Pronto (0016) |
| Unicidade por lojista, formas de pagamento por loja, consistência entre lojas, limite de lojas | Pronto (0017) |
| Travas no banco (RLS) por lojista e por loja | Pronto (0018); valem quando o app conecta com `APP_DATABASE_URL` (runbook, seção 9) |
| Painel do administrador do sistema (`/plataforma`) | Pronto: criar lojista, adicionar lojas, limite, suspender, senha do titular, saúde do isolamento |
| Resumo por loja no painel do lojista | Pronto (visão "Todas as lojas") |
| Aviso de migration pendente e diagnóstico no `/api/health` | Pronto |

Ainda não implementado, de propósito:

- **Transferência de estoque entre lojas** do mesmo lojista e **compartilhamento** de catálogo, fornecedores e jogadores por escolha do lojista. A estrutura já comporta (produtos e jogadores têm `store_id` opcional, e o estoque é por loja), faltam as telas e as regras de unir cadastros.
- **Configuração fiscal por loja** (certificado e CNPJ no banco): hoje vem do ambiente, e as notas entram na loja com o CNPJ configurado.
- **Cadastro de lojista pelo site** e cobrança por plano: hoje só pelo painel do sistema.
- Endurecimentos opcionais: remover as colunas antigas de estoque de `products` (depois de alguns dias estável) e numeração de vendas e pedidos por loja.

