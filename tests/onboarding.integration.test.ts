import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("primeiros passos: o progresso vem dos dados da loja, sem flag no banco", () => {
  let pool: typeof import("@/db").pool;
  let runWithScope: typeof import("@/db/scope").runWithScope;
  let loadGuideProgress: typeof import("@/modules/onboarding/progress").loadGuideProgress;
  let guideApplies: typeof import("@/modules/onboarding/progress").guideApplies;
  let createProduct: typeof import("@/modules/catalog/service").createProduct;
  let createCashRegister: typeof import("@/modules/cash/service").createCashRegister;
  let openCashSession: typeof import("@/modules/cash/service").openCashSession;
  let createSale: typeof import("@/modules/sales/service").createSale;
  let account: string; let lojaA: string; let lojaB: string; let userId: string; let category: string; let unit: string;
  const scope = (storeId: string | null) => ({ accountId: account, storeId, storeIds: storeId ? [storeId] : [lojaA, lojaB] });
  const progress = (storeId: string | null) => runWithScope(scope(storeId), () => loadGuideProgress({ id: userId }));
  const done = async (storeId: string | null) => (await progress(storeId)).steps.filter((step) => step.done).map((step) => step.id);

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL = url;
    ({ pool } = await import("@/db"));
    ({ runWithScope } = await import("@/db/scope"));
    ({ loadGuideProgress, guideApplies } = await import("@/modules/onboarding/progress"));
    ({ createProduct } = await import("@/modules/catalog/service"));
    ({ createCashRegister, openCashSession } = await import("@/modules/cash/service"));
    ({ createSale } = await import("@/modules/sales/service"));
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await resetTenancy(pool);
    account = (await pool.query<{ id: string }>("SELECT id FROM accounts")).rows[0].id;
    lojaA = (await pool.query<{ id: string }>("SELECT id FROM stores")).rows[0].id;
    lojaB = (await pool.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja B') RETURNING id", [account])).rows[0].id;
    await pool.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('PIX','PIX',1) ON CONFLICT DO NOTHING");
    userId = (await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id,is_account_owner) VALUES ('Titular','titular@guia.test','x','ADMIN',$1,true) RETURNING id", [account])).rows[0].id;
    unit = (await pool.query<{ id: string }>("INSERT INTO units(code,name) VALUES ('UN','Unidade') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id")).rows[0].id;
    category = "";
  });
  const addCategory = async () => { category = (await pool.query<{ id: string }>("INSERT INTO categories(name,account_id) VALUES ('Cartas',$1) RETURNING id", [account])).rows[0].id; };
  const addProduct = (storeId: string, initialStock: number) => runWithScope(scope(storeId), () => createProduct({ sku: "P-1", name: "Booster", categoryId: category, unitId: unit, costCents: 100, salePriceCents: 1000, maxDiscountBps: 0, minimumStock: 0 }, initialStock, userId));

  it("quem acabou de entrar começa do zero e o primeiro passo é a categoria", async () => {
    const start = await progress(lojaA);
    expect(start.doneCount).toBe(0);
    expect(start.total).toBe(6);
    expect(start.complete).toBe(false);
    expect(start.current?.id).toBe("category");
  });

  it("cada passo se marca sozinho quando o dado existe, na ordem do caminho mínimo", async () => {
    await addCategory();
    expect(await done(lojaA)).toEqual(["category"]);
    expect((await progress(lojaA)).current?.id).toBe("product");

    await addProduct(lojaA, 0);
    expect(await done(lojaA)).toEqual(["category", "product"]);
    expect((await progress(lojaA)).current?.id).toBe("stock");

    const productId = (await pool.query<{ id: string }>("SELECT id FROM products WHERE sku='P-1'")).rows[0].id;
    await pool.query("INSERT INTO product_stock(product_id,store_id,quantity,cost_cents) VALUES ($1,$2,5,100)", [productId, lojaA]);
    expect(await done(lojaA)).toEqual(["category", "product", "stock"]);

    const register = await runWithScope(scope(lojaA), () => createCashRegister("Caixa balcão", userId));
    expect(await done(lojaA)).toContain("register");
    expect((await progress(lojaA)).current?.id).toBe("open");

    await runWithScope(scope(lojaA), async () => {
      const registerId = typeof register === "string" ? register : (await pool.query<{ id: string }>("SELECT id FROM cash_registers LIMIT 1")).rows[0].id;
      await openCashSession({ registerId, openingAmountCents: 0, notes: "" }, userId);
    });
    expect((await progress(lojaA)).current?.id).toBe("sale");

    await runWithScope(scope(lojaA), () => createSale({ items: [{ productId, quantity: 1, discountBasisPoints: 0 }], payments: [{ methodCode: "PIX", amountAppliedCents: 1000 }] }, userId));
    const finished = await progress(lojaA);
    expect(finished.complete).toBe(true);
    expect(finished.doneCount).toBe(6);
    expect(finished.current).toBeNull();
  });

  it("o progresso é de cada loja: o que a loja A fez não conta para a B, e a visão de todas as lojas soma", async () => {
    await addCategory();
    await addProduct(lojaA, 3);
    expect(await done(lojaA)).toEqual(["category", "product", "stock"]);
    // a loja B só enxerga a categoria (que é do lojista); produto e estoque são da A
    expect(await done(lojaB)).toEqual(["category"]);
    expect(await done(null)).toEqual(["category", "product", "stock"]);
  });

  it("os extras (equipe e nota fiscal) aparecem como feitos só quando existem", async () => {
    const before = (await progress(lojaA)).extras;
    expect(before.find((extra) => extra.href === "/admin/users")?.done).toBe(false);
    await pool.query("INSERT INTO users(name,email,password_hash,role,account_id) VALUES ('Caixa','caixa@guia.test','x','OPERATOR',$1)", [account]);
    expect((await progress(lojaA)).extras.find((extra) => extra.href === "/admin/users")?.done).toBe(true);
  });

  it("o guia vale só para o administrador de um lojista", () => {
    expect(guideApplies({ role: "ADMIN", accountId: "conta" })).toBe(true);
    expect(guideApplies({ role: "OPERATOR", accountId: "conta" })).toBe(false);
    expect(guideApplies({ role: "ADMIN", accountId: null })).toBe(false);
  });
});
