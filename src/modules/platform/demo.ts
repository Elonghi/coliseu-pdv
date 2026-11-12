import { hash } from "bcryptjs";
import { pool } from "@/db";
import { runWithScope, type DbScope } from "@/db/scope";
import { calculateDiscount } from "@/lib/money";
import { createProduct } from "@/modules/catalog/service";
import { createCashRegister, openCashSession } from "@/modules/cash/service";
import { permissions } from "@/modules/auth/permissions";
import { settleFinancialInstallment } from "@/modules/finance/service";
import { importFiscalXmlBatch } from "@/modules/fiscal/service";
import { receiveFiscalInvoiceItems, receiveFiscalInvoiceStock } from "@/modules/fiscal/stock";
import { adjustPlayerCredit, createPlayer } from "@/modules/players/service";
import { addPurchaseItem, createPurchaseOrder, createSupplier, sendPurchaseOrder } from "@/modules/purchases/service";
import { cancelSale, createSale } from "@/modules/sales/service";
import { between, buildNfe, demoCatalog, demoCnpj, demoEan, demoPlayers, demoSuppliers, mulberry32, pick, type DemoProduct, type NfeItem } from "./demo-data";
import { addStore, asPlatform, createAccount } from "./service";

/* Cliente de demonstração para apresentações: um lojista com duas lojas, equipe, catálogo, jogadores, notas fiscais (uma entrada
 * completa, uma com falta e uma ainda por dar entrada), duplicatas a pagar, quatro semanas de vendas de verdade (feitas pelo
 * mesmo serviço do PDV, com as regras de estoque, caixa e financeiro) e um pedido de compra. Tudo fictício. */

export type DemoInput = { name?: string; ownerName?: string; ownerEmail: string; password: string; seed?: number; today?: Date };
export type DemoLogin = { email: string; name: string; role: string; stores: string };
export type DemoResult = {
  accountId: string; accountName: string; logins: DemoLogin[];
  counts: { stores: number; products: number; players: number; invoices: number; sales: number; canceled: number; payables: number; purchaseOrders: number; failedSales: number };
  /** Motivos distintos das vendas que o sistema recusou durante a geração (vazio quando tudo correu bem). */
  failures: string[];
};

const DAY = 86_400_000;
const brasilia = (date: Date, hour: number, minute: number) => new Date(`${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const dateTimeLocal = (date: Date) => date.toISOString().slice(0, 16);

type StoreRef = { id: string; name: string; cnpj: string };
type Catalog = Map<string, DemoProduct & { id: string; ean: string }>;

/** A primeira loja trabalha com todo o catálogo de demonstração; a segunda, com uma seleção menor. */
const carries = (storeIndex: number, product: DemoProduct, index: number) => storeIndex === 0 || (product.kind !== "single" && !(product.kind === "sealed" && index % 3 === 0));

const quantityFor = (product: DemoProduct, plan: "A" | "B" | "C", factor: number) => {
  const base = { booster: 48, sealed: 8, single: 4, accessory: 24, snack: 36 }[product.kind];
  return Math.max(2, Math.round(base * factor * (plan === "A" ? 1 : plan === "B" ? 0.5 : 0.35)));
};

export async function createDemoAccount(input: DemoInput, actorId: string, options: { skipIsolationCheck?: boolean } = {}): Promise<DemoResult> {
  const random = mulberry32(input.seed ?? 2026);
  const now = input.today ?? new Date();
  const name = input.name?.trim() || "Arena Dourada (demonstração)";
  const [local, domain] = input.ownerEmail.trim().toLowerCase().split("@");
  const teamEmail = (suffix: string) => `${local}+${suffix}@${domain}`;
  // O CNPJ de cada loja é único no sistema (a sincronização fiscal se identifica por ele): deriva do e-mail do titular, para poder
  // existir mais de uma demonstração ao mesmo tempo.
  const salt = [...input.ownerEmail.trim().toLowerCase()].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 400_000, 7);
  const cnpjs = [demoCnpj(1000 + salt * 2), demoCnpj(1001 + salt * 2)];

  const accountId = await asPlatform(() => createAccount({
    name, ownerName: input.ownerName?.trim() || "Titular da Demonstração", ownerEmail: input.ownerEmail, ownerPassword: input.password,
    storeName: "Loja Centro", storeCnpj: cnpjs[0], maxStores: null, notes: "Cliente de demonstração, com dados fictícios. Pode ser suspenso quando não for mais usado.",
  }, actorId, options));

  try {
    await asPlatform(() => addStore(accountId, { name: "Loja Shopping", cnpj: cnpjs[1] }, actorId, options));
    const rows = await asPlatform(async () => (await pool.query<{ id: string; name: string; cnpj: string }>("SELECT id,name,cnpj FROM stores WHERE account_id=$1 ORDER BY created_at", [accountId])).rows);
    const stores: StoreRef[] = rows;
    const titular = await asPlatform(async () => (await pool.query<{ id: string }>("SELECT id FROM users WHERE account_id=$1 AND is_account_owner", [accountId])).rows[0].id);
    const scopeOf = (store: StoreRef): DbScope => ({ accountId, storeId: store.id, storeIds: [store.id] });
    const inStore = <T>(store: StoreRef, run: () => Promise<T>) => runWithScope(scopeOf(store), run);

    // Equipe: um gerente só da loja Shopping (administrador sem ser o lojista) e um caixa por loja.
    const passwordHash = await hash(input.password, 12);
    const team = [
      { name: "Gerente da Loja Shopping", email: teamEmail("gerente-shopping"), role: "ADMIN" as const, store: stores[1], extra: [] as string[] },
      { name: "Caixa da Loja Centro", email: teamEmail("caixa-centro"), role: "OPERATOR" as const, store: stores[0], extra: [permissions.CASH_MANAGE, permissions.SALES_VIEW] },
      { name: "Caixa da Loja Shopping", email: teamEmail("caixa-shopping"), role: "OPERATOR" as const, store: stores[1], extra: [permissions.CASH_MANAGE, permissions.SALES_VIEW] },
    ];
    const memberIds = new Map<string, string>();
    await asPlatform(async () => {
      for (const member of team) {
        const id = (await pool.query<{ id: string }>("INSERT INTO users (name,email,password_hash,role,account_id) VALUES ($1,$2,$3,$4,$5) RETURNING id", [member.name, member.email, passwordHash, member.role, accountId])).rows[0].id;
        await pool.query("INSERT INTO user_stores (user_id,store_id) VALUES ($1,$2)", [id, member.store.id]);
        for (const permission of member.extra) await pool.query("INSERT INTO user_permissions (user_id,permission) VALUES ($1,$2)", [id, permission]);
        memberIds.set(member.email, id);
      }
    });
    const operators = [memberIds.get(teamEmail("caixa-centro"))!, memberIds.get(teamEmail("caixa-shopping"))!];

    // Fornecedores, jogadores e categorias são do lojista e valem para as duas lojas. Os produtos são de cada loja (abaixo).
    const catalogs: Catalog[] = stores.map(() => new Map());
    const supplierIds: string[] = [];
    const playerIds: { id: string; credit: number }[] = [];
    let units = new Map<string, string>();
    const categories = new Map<string, string>();
    await inStore(stores[0], async () => {
      await pool.query("INSERT INTO units (code,name) VALUES ('UN','Unidade'),('PCT','Pacote'),('CX','Caixa') ON CONFLICT (code) DO NOTHING");
      units = new Map((await pool.query<{ id: string; code: string }>("SELECT id,code FROM units WHERE code IN ('UN','PCT','CX')")).rows.map((row) => [row.code, row.id]));
      for (const category of new Set(demoCatalog.map((product) => product.category))) {
        categories.set(category, (await pool.query<{ id: string }>("INSERT INTO categories (name) VALUES ($1) RETURNING id", [category])).rows[0].id);
      }
      for (const [index, supplier] of demoSuppliers.entries()) supplierIds.push(await createSupplier({ name: supplier.name, document: demoCnpj(10 + index), email: supplier.email, phone: supplier.phone }, titular));
      for (const player of demoPlayers) {
        const id = await createPlayer({ name: player.name, phone: player.phone, email: "", notes: "Jogador de demonstração" }, titular);
        if (player.credit > 0) await adjustPlayerCredit(id, player.credit, "Crédito de demonstração", titular);
        playerIds.push({ id, credit: player.credit });
      }
    });

    const failures = new Set<string>();
    const counts = { stores: stores.length, products: 0, players: playerIds.length, invoices: 0, sales: 0, canceled: 0, payables: 0, purchaseOrders: 0, failedSales: 0 };

    for (const [storeIndex, store] of stores.entries()) {
      const operator = operators[storeIndex];
      const factor = storeIndex === 0 ? 1 : 0.7;
      const catalog = catalogs[storeIndex];
      await inStore(store, async () => {
        // Cada loja tem o seu catálogo (mesmo SKU e código de barras podem repetir entre lojas). A segunda não trabalha com cartas
        // avulsas e tem uma seleção menor de produtos fechados, para a separação por loja aparecer nas listas.
        for (const [index, product] of demoCatalog.entries()) {
          if (!carries(storeIndex, product, index)) continue;
          const ean = demoEan(index + 1);
          const id = await createProduct({
            sku: product.sku, barcode: ean, name: product.name, description: product.description ?? null, categoryId: categories.get(product.category)!, unitId: units.get(product.unit)!,
            costCents: product.costCents, salePriceCents: product.priceCents, maxDiscountBps: product.maxDiscountBps, minimumStock: product.minimumStock,
            canSplitIntoBoosters: product.splittable ?? false, isLooseBooster: product.loose ?? false,
            tcgGame: product.tcgGame ?? null, tcgSetName: product.tcgSet ?? null, tcgLanguage: product.tcgLanguage ?? null, tcgCondition: product.tcgCondition ?? null, tcgRarity: product.tcgRarity ?? null, active: true,
          }, 0, titular);
          catalog.set(product.sku, { ...product, id, ean });
        }
        counts.products += catalog.size;

        // Caixa aberto desde o começo do período, para as vendas em dinheiro.
        await createCashRegister("Caixa 1", titular);
        const register = (await pool.query<{ id: string }>("SELECT id FROM cash_registers ORDER BY created_at DESC LIMIT 1")).rows[0].id;
        const session = await openCashSession({ registerId: register, openingAmountCents: 20_000, notes: "Abertura de demonstração" }, operator);
        await pool.query("UPDATE cash_sessions SET opened_at=$1 WHERE id=$2", [new Date(now.getTime() - 29 * DAY), session]);

        // Notas fiscais de compra: A entrada completa, B com uma falta registrada, C ainda por dar entrada.
        const available = new Map<string, number>();
        const plans = [
          { key: "A", daysAgo: 40, supplier: 0, due: [30, 45], filter: () => true },
          { key: "B", daysAgo: 18, supplier: 1, due: [10, 40], filter: (p: DemoProduct) => ["booster", "accessory", "snack"].includes(p.kind) },
          { key: "C", daysAgo: 2, supplier: 0, due: [28], filter: (p: DemoProduct) => ["sealed", "single"].includes(p.kind) },
        ] as const;
        for (const [planIndex, plan] of plans.entries()) {
          const items: NfeItem[] = demoCatalog.filter((product) => catalog.has(product.sku) && plan.filter(product)).map((product) => ({ sku: product.sku, name: product.name, ean: catalog.get(product.sku)!.ean, unit: product.unit, quantity: quantityFor(product, plan.key, factor), unitCostCents: product.costCents }));
          const nfe = buildNfe({
            number: 1000 + storeIndex * 100 + planIndex * 10 + 1, emittedAt: new Date(now.getTime() - plan.daysAgo * DAY), supplier: { name: demoSuppliers[plan.supplier].name, cnpj: demoCnpj(10 + plan.supplier) },
            recipient: { name: store.name, cnpj: store.cnpj }, items, dueInDays: [...plan.due], random,
          });
          const imported = await importFiscalXmlBatch([{ name: `NFe-${nfe.key}.xml`, xml: nfe.xml }], titular, { environment: "HOMOLOGATION", cnpj: store.cnpj, ufCode: 35 });
          if (imported.importedCount !== 1) throw new Error(`Importação da NF-e de demonstração falhou: ${imported.results[0]?.message}`);
          counts.invoices += 1;
          counts.payables += plan.due.length;
          const invoiceId = (await pool.query<{ id: string }>("SELECT id FROM fiscal_invoices WHERE access_key=$1", [nfe.key])).rows[0].id;
          if (plan.key === "A") {
            await receiveFiscalInvoiceStock(invoiceId, titular);
            for (const item of items) available.set(item.sku, (available.get(item.sku) ?? 0) + item.quantity);
            const first = (await pool.query<{ id: string; amount_cents: number }>(`SELECT i.id,i.amount_cents FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id WHERE a.fiscal_invoice_id=$1 ORDER BY i.installment_number LIMIT 1`, [invoiceId])).rows[0];
            await settleFinancialInstallment({ installmentId: first.id, amountCents: first.amount_cents, methodCode: "PIX", occurredAt: dateTimeLocal(new Date(now.getTime() - 12 * DAY)), personName: demoSuppliers[plan.supplier].name, notes: "Pagamento de demonstração" }, titular);
          } else if (plan.key === "B") {
            const rows = (await pool.query<{ id: string; product_code: string }>("SELECT id,product_code FROM fiscal_invoice_items WHERE invoice_id=$1", [invoiceId])).rows;
            const missingSku = "ACC-PLAYMAT";
            await receiveFiscalInvoiceItems(invoiceId, rows.map((row) => ({ itemId: row.id, action: row.product_code === missingSku ? "MISSING" as const : "RECEIVED" as const })), { id: titular, name: "Titular da Demonstração" }, "Playmats não vieram na caixa (demonstração).");
            for (const item of items) if (item.sku !== missingSku) available.set(item.sku, (available.get(item.sku) ?? 0) + item.quantity);
          }
        }

        // Um pedido de compra enviado, aguardando o fornecedor.
        const order = await createPurchaseOrder({ supplierId: supplierIds[0], expectedAt: dateOnly(new Date(now.getTime() + 7 * DAY)), notes: "Reposição de boosters (demonstração)" }, titular);
        for (const sku of ["MTG-BST-PLY", "PKM-BST", "YGO-BST"]) await addPurchaseItem({ orderId: order, productId: catalog.get(sku)!.id, quantity: 24, unitCostCents: catalog.get(sku)!.costCents }, titular);
        await sendPurchaseOrder(order, titular);
        counts.purchaseOrders += 1;

        // Quatro semanas de vendas, pelo mesmo serviço do PDV.
        const creditPlayers = playerIds.filter((player) => player.credit > 0).map((player) => ({ ...player }));
        const futurePlayers = playerIds.filter((player) => player.credit === 0);
        const pixOnly: number[] = [];
        for (let day = 28; day >= 0; day--) {
          const date = new Date(now.getTime() - day * DAY);
          const weekend = [0, 6].includes(date.getUTCDay());
          const sales = weekend ? between(random, 3, 6) : between(random, 1, 3);
          for (let n = 0; n < sales; n++) {
            const pool_ = [...available.entries()].filter(([, quantity]) => quantity > 0).map(([sku]) => catalog.get(sku)!);
            if (!pool_.length) break;
            const chosen = new Map<string, { product: typeof pool_[number]; quantity: number; discount: number }>();
            for (let i = 0, wanted = between(random, 1, 3); i < wanted; i++) {
              const product = pick(random, pool_);
              if (chosen.has(product.sku)) continue;
              const quantity = Math.min(available.get(product.sku)!, product.kind === "snack" ? between(random, 1, 3) : between(random, 1, 2));
              chosen.set(product.sku, { product, quantity, discount: random() < 0.12 && product.maxDiscountBps >= 500 ? 500 : 0 });
            }
            const lines = [...chosen.values()];
            const total = lines.reduce((sum, line) => { const gross = line.product.priceCents * line.quantity; return sum + gross - calculateDiscount(gross, line.discount); }, 0);
            const roll = random();
            const payments: { methodCode: string; amountAppliedCents: number; amountReceivedCents?: number; playerId?: string; dueDate?: string }[] = [];
            let when = brasilia(date, between(random, 10, 20), between(random, 0, 59));
            if (when.getTime() > now.getTime() - 300_000) when = new Date(now.getTime() - between(random, 6, 240) * 60_000);
            let tag: "pix" | "other" = "other";
            if (roll < 0.42) { payments.push({ methodCode: "PIX", amountAppliedCents: total }); tag = "pix"; }
            else if (roll < 0.62) payments.push({ methodCode: "CASH", amountAppliedCents: total, amountReceivedCents: Math.ceil(total / 500) * 500 });
            else if (roll < 0.80) payments.push({ methodCode: pick(random, ["DEBIT_CARD", "CREDIT_CARD"]), amountAppliedCents: total });
            else if (roll < 0.88 && total >= 10_000) { const half = Math.floor(total / 2); payments.push({ methodCode: "PIX", amountAppliedCents: half }, { methodCode: "CASH", amountAppliedCents: total - half, amountReceivedCents: Math.ceil((total - half) / 500) * 500 }); }
            else if (roll < 0.94) {
              const player = creditPlayers.find((candidate) => candidate.credit >= total);
              if (player) { payments.push({ methodCode: "PLAYER_CREDIT", amountAppliedCents: total, playerId: player.id }); player.credit -= total; } else payments.push({ methodCode: "PIX", amountAppliedCents: total });
            } else payments.push({ methodCode: "FUTURE", amountAppliedCents: total, playerId: pick(random, futurePlayers).id, dueDate: dateOnly(new Date(when.getTime() + 14 * DAY)) });
            try {
              const sale = await createSale({ items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, discountBasisPoints: line.discount })), payments }, operator);
              for (const line of lines) available.set(line.product.sku, available.get(line.product.sku)! - line.quantity);
              await pool.query("UPDATE sales SET created_at=$1 WHERE id=$2", [when, sale.id]);
              await pool.query("UPDATE payments SET created_at=$1 WHERE sale_id=$2", [when, sale.id]);
              await pool.query("UPDATE stock_movements SET created_at=$1 WHERE sale_id=$2", [when, sale.id]);
              await pool.query("UPDATE player_credit_movements SET created_at=$1 WHERE sale_id=$2", [when, sale.id]);
              await pool.query("UPDATE financial_accounts SET created_at=$1 WHERE sale_id=$2", [when, sale.id]);
              counts.sales += 1;
              if (tag === "pix") pixOnly.push(sale.id);
            } catch (error) { counts.failedSales += 1; failures.add(error instanceof Error ? error.message : String(error)); }
          }
        }
        for (const saleId of pixOnly.slice(2, 4)) { await cancelSale(saleId, "Cliente desistiu da compra (demonstração)", titular); counts.canceled += 1; }
      });
    }

    return {
      accountId, accountName: name, counts, failures: [...failures].slice(0, 5),
      logins: [
        { email: input.ownerEmail.trim().toLowerCase(), name: input.ownerName?.trim() || "Titular da Demonstração", role: "Lojista (vê todas as lojas)", stores: "Loja Centro, Loja Shopping" },
        ...team.map((member) => ({ email: member.email, name: member.name, role: member.role === "ADMIN" ? "Administrador" : "Operador de caixa", stores: member.store.name })),
      ],
    };
  } catch (error) {
    await asPlatform(() => pool.query("UPDATE accounts SET active=false,notes=$2,updated_at=now() WHERE id=$1", [accountId, `Demonstração incompleta (falhou na criação): ${error instanceof Error ? error.message : "erro desconhecido"}`.slice(0, 1000)]));
    throw new Error(`A demonstração não foi concluída e o lojista foi suspenso (${error instanceof Error ? error.message : "erro desconhecido"}). Crie outra com outro e-mail.`);
  }
}
