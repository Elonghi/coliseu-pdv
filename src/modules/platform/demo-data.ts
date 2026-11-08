/* Dados e geradores do cliente de demonstração: tudo fictício, determinístico (a mesma semente gera os mesmos dados) e
 * sem acesso ao banco, para poder ser testado à parte. O orquestrador que grava no sistema é ./demo.ts. */

export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export type Random = () => number;
export const pick = <T>(random: Random, items: readonly T[]) => items[Math.floor(random() * items.length)];
export const between = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));

/** Dígito verificador do EAN-13 a partir dos 12 primeiros dígitos. */
export function ean13Digit(payload: string) {
  const total = [...payload].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0);
  return String((10 - (total % 10)) % 10);
}
/** EAN-13 válido, com prefixo do Brasil (789), derivado do número do item. */
export const demoEan = (index: number) => { const payload = `789${String(900_000_000 + index * 137).padStart(9, "0")}`; return payload + ean13Digit(payload); };

/** CNPJ com dígitos verificadores corretos, de base fictícia (99.xxx.xxx/0001-xx). */
export function demoCnpj(index: number) {
  const base = `99${String(100_000 + index).padStart(6, "0")}0001`;
  const digit = (digits: string, weights: number[]) => { const rest = [...digits].reduce((sum, value, i) => sum + Number(value) * weights[i], 0) % 11; return rest < 2 ? 0 : 11 - rest; };
  const first = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${first}${digit(base + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`;
}

/** Chave de acesso de 44 dígitos com o dígito verificador (módulo 11) correto. */
export function accessKey(input: { uf: number; emittedAt: Date; cnpj: string; number: number; code: number }) {
  const yymm = `${String(input.emittedAt.getUTCFullYear()).slice(2)}${String(input.emittedAt.getUTCMonth() + 1).padStart(2, "0")}`;
  const body = `${input.uf}${yymm}${input.cnpj}55001${String(input.number).padStart(9, "0")}1${String(input.code).padStart(8, "0")}`;
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (2 + (index % 8)), 0);
  const rest = sum % 11;
  return `${body}${rest < 2 ? 0 : 11 - rest}`;
}

export type DemoProduct = {
  sku: string; name: string; category: string; unit: "UN" | "PCT" | "CX"; costCents: number; priceCents: number; maxDiscountBps: number; minimumStock: number;
  kind: "booster" | "sealed" | "single" | "accessory" | "snack";
  splittable?: boolean; loose?: boolean; tcgGame?: string; tcgSet?: string; tcgLanguage?: string; tcgCondition?: string; tcgRarity?: string; description?: string;
};

const MTG = "Magic: The Gathering", PKM = "Pokémon TCG", YGO = "Yu-Gi-Oh!", ACC = "Acessórios TCG", SNK = "Bebidas e snacks";
const sealed = (game: string, set: string) => ({ tcgGame: game, tcgSet: set, tcgLanguage: "Português" });

export const demoCatalog: DemoProduct[] = [
  { sku: "MTG-BST-PLY", name: "Magic — Play Booster Bloomburrow", category: MTG, unit: "PCT", costCents: 2600, priceCents: 4290, maxDiscountBps: 500, minimumStock: 12, kind: "booster", loose: true, ...sealed(MTG, "Bloomburrow"), description: "Booster avulso de Play Booster." },
  { sku: "MTG-BOX-PLY", name: "Magic — Play Booster Box Bloomburrow (36)", category: MTG, unit: "CX", costCents: 98000, priceCents: 139900, maxDiscountBps: 500, minimumStock: 2, kind: "sealed", splittable: true, ...sealed(MTG, "Bloomburrow"), description: "Display lacrado com 36 Play Boosters." },
  { sku: "MTG-BST-COL", name: "Magic — Collector Booster Bloomburrow", category: MTG, unit: "PCT", costCents: 11500, priceCents: 15990, maxDiscountBps: 500, minimumStock: 4, kind: "booster", loose: true, ...sealed(MTG, "Bloomburrow") },
  { sku: "MTG-BDL", name: "Magic — Bundle Bloomburrow (9 boosters)", category: MTG, unit: "UN", costCents: 33000, priceCents: 44990, maxDiscountBps: 500, minimumStock: 2, kind: "sealed", splittable: true, ...sealed(MTG, "Bloomburrow") },
  { sku: "MTG-CMD", name: "Magic — Commander Deck Pronto para Jogar", category: MTG, unit: "UN", costCents: 68000, priceCents: 89990, maxDiscountBps: 500, minimumStock: 2, kind: "sealed", ...sealed(MTG, "Commander") },
  { sku: "MTG-SGL-SOL", name: "Carta avulsa — Anel Solar (NM)", category: MTG, unit: "UN", costCents: 1800, priceCents: 3290, maxDiscountBps: 1000, minimumStock: 2, kind: "single", tcgGame: MTG, tcgSet: "Commander Masters", tcgLanguage: "Inglês", tcgCondition: "NM", tcgRarity: "Uncommon" },
  { sku: "MTG-SGL-LOT", name: "Carta avulsa — Lótus Negro Réplica (NM)", category: MTG, unit: "UN", costCents: 4500, priceCents: 8990, maxDiscountBps: 1000, minimumStock: 1, kind: "single", tcgGame: MTG, tcgSet: "Promo", tcgLanguage: "Inglês", tcgCondition: "NM", tcgRarity: "Rare" },
  { sku: "PKM-BST", name: "Pokémon — Booster Avulso Fagulhas Surgentes", category: PKM, unit: "PCT", costCents: 1900, priceCents: 2990, maxDiscountBps: 500, minimumStock: 12, kind: "booster", loose: true, ...sealed(PKM, "Fagulhas Surgentes") },
  { sku: "PKM-ETB", name: "Pokémon — Elite Trainer Box Fagulhas Surgentes", category: PKM, unit: "CX", costCents: 29000, priceCents: 39990, maxDiscountBps: 500, minimumStock: 2, kind: "sealed", splittable: true, ...sealed(PKM, "Fagulhas Surgentes") },
  { sku: "PKM-TRP", name: "Pokémon — Triple Pack Blister", category: PKM, unit: "UN", costCents: 8800, priceCents: 12990, maxDiscountBps: 500, minimumStock: 4, kind: "sealed", splittable: true, ...sealed(PKM, "Coleção Atual") },
  { sku: "PKM-LBD", name: "Pokémon — League Battle Deck Charizard ex", category: PKM, unit: "UN", costCents: 18500, priceCents: 24990, maxDiscountBps: 500, minimumStock: 2, kind: "sealed", ...sealed(PKM, "Battle Deck") },
  { sku: "PKM-TIN", name: "Pokémon — Lata Colecionável Pikachu", category: PKM, unit: "UN", costCents: 9500, priceCents: 13990, maxDiscountBps: 500, minimumStock: 3, kind: "sealed", ...sealed(PKM, "Latas") },
  { sku: "YGO-BST", name: "Yu-Gi-Oh! — Booster Avulso Maré Ancestral", category: YGO, unit: "PCT", costCents: 1700, priceCents: 2790, maxDiscountBps: 500, minimumStock: 12, kind: "booster", loose: true, ...sealed(YGO, "Maré Ancestral") },
  { sku: "YGO-BOX", name: "Yu-Gi-Oh! — Booster Box Maré Ancestral (24)", category: YGO, unit: "CX", costCents: 34000, priceCents: 47990, maxDiscountBps: 500, minimumStock: 2, kind: "sealed", splittable: true, ...sealed(YGO, "Maré Ancestral"), description: "Booster box com 24 boosters." },
  { sku: "YGO-STR", name: "Yu-Gi-Oh! — Structure Deck Pronto para Duelo", category: YGO, unit: "UN", costCents: 6200, priceCents: 9990, maxDiscountBps: 500, minimumStock: 3, kind: "sealed", ...sealed(YGO, "Structure Deck") },
  { sku: "YGO-TIN", name: "Yu-Gi-Oh! — Lata Mega Pack", category: YGO, unit: "UN", costCents: 7400, priceCents: 11990, maxDiscountBps: 500, minimumStock: 3, kind: "sealed", ...sealed(YGO, "Lata") },
  { sku: "ACC-SLV100", name: "Sleeves premium pretos — 100 unidades", category: ACC, unit: "PCT", costCents: 2500, priceCents: 4490, maxDiscountBps: 1000, minimumStock: 8, kind: "accessory" },
  { sku: "ACC-SLV50", name: "Sleeves coloridos — 50 unidades", category: ACC, unit: "PCT", costCents: 1400, priceCents: 2590, maxDiscountBps: 1000, minimumStock: 8, kind: "accessory" },
  { sku: "ACC-DECKBOX", name: "Deck Box para 100 cards", category: ACC, unit: "UN", costCents: 1500, priceCents: 2990, maxDiscountBps: 1000, minimumStock: 6, kind: "accessory" },
  { sku: "ACC-DECKPRO", name: "Deck Box rígida premium com divisória", category: ACC, unit: "UN", costCents: 3800, priceCents: 6990, maxDiscountBps: 1000, minimumStock: 4, kind: "accessory" },
  { sku: "ACC-BIND", name: "Fichário TCG 9 bolsos", category: ACC, unit: "UN", costCents: 4500, priceCents: 7990, maxDiscountBps: 1000, minimumStock: 3, kind: "accessory" },
  { sku: "ACC-PLAYMAT", name: "Playmat de borracha 60x35", category: ACC, unit: "UN", costCents: 5500, priceCents: 9990, maxDiscountBps: 1000, minimumStock: 3, kind: "accessory" },
  { sku: "ACC-DICE", name: "Kit de dados contadores de vida", category: ACC, unit: "UN", costCents: 900, priceCents: 1990, maxDiscountBps: 1000, minimumStock: 6, kind: "accessory" },
  { sku: "ACC-TOPLOAD", name: "Toploader rígido — 25 unidades", category: ACC, unit: "PCT", costCents: 1200, priceCents: 2490, maxDiscountBps: 1000, minimumStock: 6, kind: "accessory" },
  { sku: "BEB-COLA", name: "Refrigerante cola 2L", category: SNK, unit: "UN", costCents: 500, priceCents: 900, maxDiscountBps: 1000, minimumStock: 10, kind: "snack" },
  { sku: "BEB-LATA", name: "Refrigerante lata 350ml", category: SNK, unit: "UN", costCents: 300, priceCents: 600, maxDiscountBps: 1000, minimumStock: 18, kind: "snack" },
  { sku: "BEB-AGUA", name: "Água mineral 500ml", category: SNK, unit: "UN", costCents: 100, priceCents: 300, maxDiscountBps: 500, minimumStock: 15, kind: "snack" },
  { sku: "BEB-ENERG", name: "Energético lata 250ml", category: SNK, unit: "UN", costCents: 650, priceCents: 1200, maxDiscountBps: 800, minimumStock: 8, kind: "snack" },
  { sku: "SNK-SALG", name: "Salgadinho 100g", category: SNK, unit: "UN", costCents: 250, priceCents: 550, maxDiscountBps: 800, minimumStock: 8, kind: "snack" },
  { sku: "SNK-CHOC", name: "Chocolate ao leite 90g", category: SNK, unit: "UN", costCents: 350, priceCents: 700, maxDiscountBps: 800, minimumStock: 6, kind: "snack" },
  { sku: "SNK-BARRA", name: "Barra de cereal", category: SNK, unit: "UN", costCents: 120, priceCents: 300, maxDiscountBps: 500, minimumStock: 8, kind: "snack" },
];

export const demoSuppliers = [
  { name: "Distribuidora Cards e Games Ltda", email: "vendas@cardsgames.example", phone: "(11) 4002-0001" },
  { name: "Importadora Mundo TCG S.A.", email: "pedidos@mundotcg.example", phone: "(11) 4002-0002" },
] as const;

export const demoPlayers = [
  { name: "Lucas Ferraz", phone: "(11) 90000-0001", credit: 8000 }, { name: "Marina Duarte", phone: "(11) 90000-0002", credit: 12000 },
  { name: "Rafael Quintana", phone: "(11) 90000-0003", credit: 5000 }, { name: "Beatriz Nogueira", phone: "(11) 90000-0004", credit: 0 },
  { name: "Thiago Albuquerque", phone: "(11) 90000-0005", credit: 0 }, { name: "Camila Prado", phone: "(11) 90000-0006", credit: 0 },
  { name: "Gustavo Medeiros", phone: "(11) 90000-0007", credit: 0 }, { name: "Helena Vasconcelos", phone: "(11) 90000-0008", credit: 0 },
] as const;

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const decimal = (cents: number, places = 2) => (cents / 100).toFixed(places);

export type NfeItem = { sku: string; name: string; ean: string; unit: string; quantity: number; unitCostCents: number };
export type NfeInput = {
  number: number; emittedAt: Date; supplier: { name: string; cnpj: string }; recipient: { name: string; cnpj: string };
  items: NfeItem[]; dueInDays: number[]; random: Random;
};

/** NF-e de compra completa (nfeProc) no mesmo formato que o importador lê: emitente, destinatário, itens, totais e duplicatas. */
export function buildNfe(input: NfeInput) {
  const key = accessKey({ uf: 35, emittedAt: input.emittedAt, cnpj: input.supplier.cnpj, number: input.number, code: between(input.random, 10_000_000, 99_999_999) });
  const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "-00:00").replace("-00:00", "+00:00");
  const emitted = iso(input.emittedAt);
  const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0);
  const lines = input.items.map((item, index) => `<det nItem="${index + 1}"><prod><cProd>${escapeXml(item.sku)}</cProd><cEAN>${item.ean}</cEAN><xProd>${escapeXml(item.name)}</xProd><NCM>95044000</NCM><CFOP>5102</CFOP><uCom>${item.unit}</uCom><qCom>${item.quantity.toFixed(4)}</qCom><vUnCom>${decimal(item.unitCostCents, 4)}</vUnCom><vProd>${decimal(item.quantity * item.unitCostCents)}</vProd></prod><imposto><ICMS><ICMS00><vICMS>0.00</vICMS></ICMS00></ICMS></imposto></det>`).join("");
  const installments = input.dueInDays.map((days, index) => {
    const due = new Date(input.emittedAt.getTime() + days * 86_400_000);
    const part = index === input.dueInDays.length - 1 ? total - Math.floor(total / input.dueInDays.length) * (input.dueInDays.length - 1) : Math.floor(total / input.dueInDays.length);
    return `<dup><nDup>${String(index + 1).padStart(3, "0")}</nDup><dVenc>${due.toISOString().slice(0, 10)}</dVenc><vDup>${decimal(part)}</vDup></dup>`;
  }).join("");
  const xml = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${key}" versao="4.00"><ide><natOp>Compra de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${input.number}</nNF><dhEmi>${emitted}</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>${input.supplier.cnpj}</CNPJ><xNome>${escapeXml(input.supplier.name)}</xNome><IE>123456789</IE></emit><dest><CNPJ>${input.recipient.cnpj}</CNPJ><xNome>${escapeXml(input.recipient.name)}</xNome><IE>987654321</IE></dest>${lines}<total><ICMSTot><vNF>${decimal(total)}</vNF></ICMSTot></total><cobr><fat><nFat>${input.number}</nFat><vOrig>${decimal(total)}</vOrig><vDesc>0.00</vDesc><vLiq>${decimal(total)}</vLiq></fat>${installments}</cobr></infNFe></NFe><protNFe><infProt><chNFe>${key}</chNFe><dhRecbto>${emitted}</dhRecbto><nProt>${String(135_260_000_000_000 + input.number)}</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>`;
  return { key, xml, totalCents: total };
}
