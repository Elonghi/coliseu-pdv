import type { GuideStepId } from "@/modules/onboarding/steps";

/* Indicações do acesso guiado: para cada passo, o que apontar na tela agora. Cada indicação procura o elemento real no que está
 * aberto (menu, botão, campo vazio, modal) e devolve null quando não se aplica; vale a primeira que se aplica, na ordem da lista.
 * Por isso o guia não guarda "em que etapa da tela estou": ele olha a tela e o que já foi preenchido. */

export type TourContext = {
  path: string;
  consolidated: boolean;
  /** Campos (por name) em que a pessoa já passou: serve para campos opcionais ou com valor padrão. */
  touched: ReadonlySet<string>;
};

export type Indication = { id: string; el: HTMLElement; title: string; text: string; placement?: "top" | "bottom" | "left" | "right" };
type Finder = (context: TourContext) => Indication | null;

const shown = (el: Element | null): el is HTMLElement => Boolean(el) && (el as HTMLElement).getClientRects().length > 0 && !(el as HTMLElement).closest("[hidden]");
const pick = (selector: string, root: ParentNode = document) => { const el = root.querySelector<HTMLElement>(selector); return shown(el) ? el : null; };
const pickText = (selector: string, text: string, root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLElement>(selector)].find((el) => shown(el) && !el.hasAttribute("disabled") && (el.textContent ?? "").trim().startsWith(text)) ?? null;
const openDialog = (title: string) => {
  const dialog = document.querySelector<HTMLElement>("dialog[open]");
  return dialog && (dialog.querySelector(".dialog-title")?.textContent ?? "").trim().startsWith(title) ? dialog : null;
};
/** Vazio, ou só o valor padrão "0,00". */
const blank = (el: HTMLElement | null) => { const value = (el as HTMLInputElement | null)?.value ?? ""; return !value.trim() || /^0+([.,]0+)?$/.test(value.trim()); };
const on = (path: RegExp, context: TourContext) => path.test(context.path);

/** No celular o menu fica atrás do botão: aponta o botão em vez de um item fora da tela. */
function viaMenu(el: HTMLElement | null, indication: Omit<Indication, "el">, mobileText: string): Indication | null {
  const burger = pick('.admin-mobile-header button[aria-label="Abrir menu"]');
  if (burger && !document.querySelector(".admin-sidebar.is-open")) return { ...indication, id: `menu:${indication.id}`, el: burger, title: "Abra o menu", text: mobileText, placement: "bottom" };
  return el ? { ...indication, el } : null;
}

const nav = (href: string, label: string): Indication | null =>
  viaMenu(pick(`a.admin-nav-link[href="${href}"]`), { id: `nav:${href}`, title: `Abra ${label}`, text: `Clique em ${label} no menu.`, placement: "right" }, `Toque aqui e depois em ${label}.`);

/** Produto, estoque e caixa são de cada loja: na visão de todas as lojas, o primeiro gesto é escolher uma. */
const storeGate: Finder = (context) => context.consolidated
  ? viaMenu(pick(".store-switcher select"), { id: "store", title: "Escolha a loja", text: "Produto, estoque e caixa são de cada loja. Escolha aqui a loja que você vai configurar.", placement: "right" }, "Toque aqui, abra o menu e escolha a loja que você vai configurar.")
  : null;

const submitOf = (field: HTMLElement | null, label: string) => (field?.closest("form") ? pickText("button", label, field.closest("form")!) : null);

export const indications: Record<GuideStepId, Finder[]> = {
  category: [
    (c) => {
      if (!on(/^\/admin\/categories$/, c)) return null;
      const input = [...document.querySelectorAll<HTMLElement>("main form")].find((form) => !form.querySelector('[name="id"]') && form.querySelector('[name="name"]'))?.querySelector<HTMLElement>('[name="name"]') ?? null;
      if (!shown(input)) return null;
      if (blank(input)) return { id: "category:name", el: input, title: "Dê um nome à categoria", text: "Digite, por exemplo, \"Cartas avulsas\" ou \"Bebidas\".", placement: "bottom" };
      const button = submitOf(input, "Adicionar categoria");
      return button ? { id: "category:save", el: button, title: "Salve a categoria", text: "Clique em Adicionar categoria.", placement: "left" } : null;
    },
    () => nav("/admin/categories", "Categorias"),
  ],

  product: [
    storeGate,
    (c) => {
      if (!on(/^\/admin\/products\/new$/, c)) return null;
      const field = (name: string) => pick(`[name="${name}"]`);
      const sku = field("sku"), name = field("name"), cost = field("cost"), price = field("price"), stock = field("initialStock");
      if (!sku || !name || !cost || !price) return null;
      if (blank(sku)) return { id: "product:sku", el: sku, title: "SKU do produto", text: "Um código seu para identificar o item, como BOOSTER-01. Não pode repetir na loja.", placement: "right" };
      if (blank(name)) return { id: "product:name", el: name, title: "Nome do produto", text: "É o nome que aparece no PDV e nas etiquetas.", placement: "right" };
      if (blank(cost)) return { id: "product:cost", el: cost, title: "Quanto custou", text: "O valor que você paga por unidade. Serve para calcular o lucro.", placement: "right" };
      if (blank(price)) return { id: "product:price", el: price, title: "Preço de venda", text: "O valor cobrado do cliente no PDV.", placement: "right" };
      if (stock && blank(stock) && !c.touched.has("initialStock")) return { id: "product:stock", el: stock, title: "Quantas unidades você tem?", text: "Informe o estoque de hoje. Isso já conclui o passo do estoque. Se não souber, deixe 0 e lance depois.", placement: "right" };
      const button = pickText("button", "Criar produto");
      return button ? { id: "product:save", el: button, title: "Tudo pronto", text: "Clique em Criar produto para salvar.", placement: "top" } : null;
    },
    (c) => {
      if (!on(/^\/admin\/products$/, c)) return null;
      const link = pick('a[href="/admin/products/new"]');
      return link ? { id: "product:new", el: link, title: "Cadastre o produto", text: "Clique em Novo produto.", placement: "bottom" } : null;
    },
    () => nav("/admin/products", "Produtos"),
  ],

  stock: [
    storeGate,
    () => {
      const dialog = document.querySelector<HTMLElement>("dialog[open]");
      const quantity = dialog ? pick('[name="quantity"]', dialog) : null;
      if (!dialog || !quantity) return null;
      const notes = pick('[name="notes"]', dialog);
      if (blank(quantity)) return { id: "stock:quantity", el: quantity, title: "Quantas unidades entram", text: "Digite a quantidade. Em Tipo, \"Entrada\" soma ao estoque.", placement: "top" };
      if (notes && !(notes as HTMLInputElement).value.trim()) return { id: "stock:notes", el: notes, title: "Motivo da entrada", text: "Escreva por que está lançando, como \"contagem inicial\". Fica no histórico.", placement: "top" };
      const button = pickText("button", "Registrar movimentação", dialog);
      return button ? { id: "stock:save", el: button, title: "Confirme", text: "Clique em Registrar movimentação.", placement: "top" } : null;
    },
    (c) => {
      if (!on(/^\/admin\/stock$/, c)) return null;
      const button = pickText("button", "Ajustar estoque");
      return button ? { id: "stock:open", el: button, title: "Lance o estoque", text: "Clique em Ajustar estoque para registrar uma entrada.", placement: "bottom" } : null;
    },
    () => nav("/admin/stock", "Estoque"),
  ],

  register: [
    storeGate,
    () => {
      const dialog = openDialog("Novo caixa");
      const name = dialog ? pick('[name="name"]', dialog) : null;
      if (!dialog || !name) return null;
      if (blank(name)) return { id: "register:name", el: name, title: "Dê um nome ao caixa", text: "Por exemplo, \"Caixa balcão\".", placement: "top" };
      const button = pickText("button", "Cadastrar caixa", dialog);
      return button ? { id: "register:save", el: button, title: "Salve o caixa", text: "Clique em Cadastrar caixa.", placement: "top" } : null;
    },
    (c) => {
      if (!on(/^\/admin\/cash$/, c)) return null;
      const button = pickText("button", "Novo caixa");
      return button ? { id: "register:open", el: button, title: "Cadastre o caixa", text: "Clique em Novo caixa.", placement: "bottom" } : null;
    },
    () => nav("/admin/cash", "Caixas"),
  ],

  open: [
    storeGate,
    (c) => {
      const dialog = openDialog("Abrir meu caixa");
      if (!dialog) return null;
      const amount = pick('[name="openingAmount"]', dialog);
      if (amount && !c.touched.has("openingAmount")) return { id: "open:amount", el: amount, title: "Fundo de troco", text: "Quanto há na gaveta agora para dar troco. Pode ser 0,00.", placement: "top" };
      const button = pickText("button", "Abrir caixa", dialog);
      return button ? { id: "open:save", el: button, title: "Abra o caixa", text: "Clique em Abrir caixa. Ele libera as vendas no PDV.", placement: "top" } : null;
    },
    (c) => {
      if (!on(/^\/admin\/cash$/, c)) return null;
      const button = pickText("button", "Abrir meu caixa");
      return button ? { id: "open:start", el: button, title: "Abra o caixa do dia", text: "Clique em Abrir meu caixa.", placement: "bottom" } : null;
    },
    () => nav("/admin/cash", "Caixas"),
  ],

  sale: [
    storeGate,
    (c) => {
      if (!on(/^\/pdv/, c)) return null;
      const confirm = pickText("button", "Confirmar venda");
      if (confirm) {
        const inputs = [...(confirm.closest("section")?.querySelectorAll<HTMLElement>('input[inputmode="decimal"]') ?? [])];
        const filled = inputs.some((input) => !blank(input));
        if (!filled && inputs[0]) return { id: "sale:payment", el: inputs[0], title: "Como o cliente pagou", text: "Digite o valor em uma forma de pagamento (PIX, dinheiro, cartão). Para pagar tudo de uma vez, use o total da venda.", placement: "right" };
        return { id: "sale:confirm", el: confirm, title: "Confirme a venda", text: "O total já veio lançado em uma forma de pagamento. Se o cliente pagou de outro jeito, ajuste os valores. Depois, clique em Confirmar venda: ela baixa o estoque e entra nos relatórios.", placement: "right" };
      }
      const search = pick('input[placeholder^="Nome, SKU"]');
      const firstResult = search?.closest(".relative")?.querySelector<HTMLElement>("div.absolute button") ?? null;
      if (shown(firstResult)) return { id: "sale:result", el: firstResult, title: "Adicione ao carrinho", text: "Clique no produto para colocá-lo no carrinho.", placement: "bottom" };
      const finish = pickText("button", "Finalizar venda");
      if (finish) return { id: "sale:finish", el: finish, title: "Finalize a venda", text: "O produto está no carrinho. Clique em Finalizar venda.", placement: "left" };
      return search ? { id: "sale:search", el: search, title: "Busque o produto", text: "Digite o nome, o SKU ou o código de barras do produto que você cadastrou.", placement: "bottom" } : null;
    },
    () => {
      const link = pick("a.admin-pdv-link");
      return viaMenu(link, { id: "nav:pdv", title: "Abra o PDV", text: "Clique em Abrir PDV: é a tela do balcão, onde as vendas acontecem.", placement: "right" }, "Toque aqui e depois em Abrir PDV.");
    },
  ],
};
