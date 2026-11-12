/* Definições dos passos do guia: só dados, sem acesso ao banco, para servirem ao servidor (progresso) e ao navegador (acesso guiado). */

export type GuideStepId = "category" | "product" | "stock" | "register" | "open" | "sale";

export type GuideStepDefinition = {
  id: GuideStepId;
  title: string;
  /** Uma frase: o que é e por que importa. */
  summary: string;
  href: string;
  action: string;
  /** O que fazer na tela, em ordem. */
  tips: string[];
  /** Depende de uma loja escolhida (produto, estoque e caixa são de cada loja). */
  storeBound: boolean;
};

export const guideSteps: readonly GuideStepDefinition[] = [
  {
    id: "category", title: "Crie uma categoria", href: "/admin/categories", action: "Abrir Categorias", storeBound: false,
    summary: "Categorias agrupam os produtos nas buscas e nos relatórios, e o cadastro de produto exige uma.",
    tips: ["Digite o nome no campo \"Nova categoria\" (ex.: Cartas avulsas, Bebidas, Acessórios).", "Clique em Adicionar categoria. Você cria as outras quando precisar."],
  },
  {
    id: "product", title: "Cadastre o primeiro produto", href: "/admin/products/new", action: "Novo produto", storeBound: true,
    summary: "É o que aparece no PDV, nas etiquetas e nos relatórios. O produto pertence à loja onde você o cadastra.",
    tips: ["Informe SKU (um código seu, como BOOSTER-01), nome e categoria.", "Preencha o custo e o preço de venda.", "Em \"Estoque inicial\", coloque quantas unidades você tem agora: isso já conclui o próximo passo.", "Clique em Criar produto."],
  },
  {
    id: "stock", title: "Lance o estoque", href: "/admin/stock", action: "Abrir Estoque", storeBound: true,
    summary: "Sem saldo o PDV não vende. O estoque é de cada loja.",
    tips: ["Se você informou o estoque inicial ao criar o produto, este passo já está feito.", "Para somar mais depois: Estoque › Ajustar estoque, tipo Entrada, com o motivo.", "Quem compra com nota fiscal pode importar o XML e dar entrada pela nota (Notas fiscais)."],
  },
  {
    id: "register", title: "Cadastre um caixa", href: "/admin/cash", action: "Abrir Caixas", storeBound: true,
    summary: "O caixa é o ponto de venda físico (ex.: Caixa balcão). Toda venda fica ligada a um caixa aberto.",
    tips: ["Em Caixas, clique em Novo caixa.", "Dê um nome, como Caixa balcão, e clique em Cadastrar caixa."],
  },
  {
    id: "open", title: "Abra o caixa do dia", href: "/admin/cash", action: "Abrir meu caixa", storeBound: true,
    summary: "A abertura registra o fundo de troco. É ela que libera as vendas no PDV.",
    tips: ["Em Caixas, clique em Abrir meu caixa.", "Escolha o caixa e informe o fundo inicial (pode ser 0,00).", "No fim do dia, o mesmo painel faz a conferência e o fechamento."],
  },
  {
    id: "sale", title: "Faça a primeira venda", href: "/pdv", action: "Abrir o PDV", storeBound: true,
    summary: "O PDV é a tela do balcão: busca o produto, soma o carrinho e registra o pagamento.",
    tips: ["Busque pelo nome, SKU ou código de barras e toque no produto para adicionar.", "Clique em Finalizar venda, informe como o cliente pagou (PIX, dinheiro, cartão) e confirme.", "A venda baixa o estoque da loja e aparece em Vendas e no Dashboard."],
  },
];
