import { pool } from "@/db";

/* Primeiros passos do lojista. O progresso não tem flag no banco: cada passo se marca sozinho quando o dado existe na loja
 * ativa (ou nas lojas da visão atual). Assim o guia nunca mente, e quem já tem a loja rodando não vê nada. */

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

export type GuideExtra = { href: string; title: string; text: string; done: boolean };

export type GuideProgress = {
  steps: (GuideStepDefinition & { done: boolean })[];
  doneCount: number;
  total: number;
  complete: boolean;
  /** Primeiro passo ainda não feito. */
  current: (GuideStepDefinition & { done: boolean }) | null;
  extras: GuideExtra[];
};

/** Só o administrador de um lojista configura o sistema; operador vai direto ao PDV. */
export const guideApplies = (user: { role: string; accountId: string | null }) => user.role === "ADMIN" && Boolean(user.accountId);

/** Lê o que já existe nas lojas da visão atual: a loja ativa, ou todas as do usuário na visão consolidada. */
export async function loadGuideProgress(user: { id: string }): Promise<GuideProgress> {
  const row = (await pool.query<Record<GuideStepId | "team" | "fiscal", boolean>>(`SELECT
    EXISTS(SELECT 1 FROM categories WHERE account_id=app_current_account() AND active) AS category,
    EXISTS(SELECT 1 FROM products p WHERE p.account_id=app_current_account() AND (p.store_id IS NULL OR p.store_id=ANY(app_store_ids()))) AS product,
    EXISTS(SELECT 1 FROM product_stock WHERE store_id=ANY(app_store_ids()) AND quantity>0) AS stock,
    EXISTS(SELECT 1 FROM cash_registers WHERE store_id=ANY(app_store_ids())) AS register,
    EXISTS(SELECT 1 FROM cash_sessions WHERE store_id=ANY(app_store_ids())) AS open,
    EXISTS(SELECT 1 FROM sales WHERE store_id=ANY(app_store_ids())) AS sale,
    EXISTS(SELECT 1 FROM users WHERE account_id=app_current_account() AND id<>$1) AS team,
    EXISTS(SELECT 1 FROM fiscal_invoices WHERE store_id=ANY(app_store_ids())) AS fiscal`, [user.id])).rows[0];
  const steps = guideSteps.map((step) => ({ ...step, done: Boolean(row[step.id]) }));
  const doneCount = steps.filter((step) => step.done).length;
  return {
    steps, doneCount, total: steps.length, complete: doneCount === steps.length, current: steps.find((step) => !step.done) ?? null,
    extras: [
      { href: "/admin/users", title: "Crie o acesso da equipe", text: "Um login para cada operador de caixa, com a loja dele.", done: row.team },
      { href: "/admin/fiscal/integration", title: "Importe uma nota fiscal de compra", text: "Envie o XML do fornecedor e dê entrada no estoque pela nota.", done: row.fiscal },
      { href: "/admin/labels", title: "Imprima etiquetas", text: "Etiquetas com código de barras para os produtos.", done: false },
      { href: "/security", title: "Ative a verificação em duas etapas", text: "Protege o seu acesso de administrador com um código no celular.", done: false },
    ],
  };
}
