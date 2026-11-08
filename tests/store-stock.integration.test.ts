import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fullXml } from "./fixtures/fiscal";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const config = { enabled: true, environment: "HOMOLOGATION" as const, cnpj: "98765432000199", ufCode: 35, certificateBase64: "AA==", certificatePassword: "teste", endpoint: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx", intervalMinutes: 60, maxBatches: 20 };

suite("estoque por loja: o mesmo produto, saldos separados", () => {
  let pool: typeof import("@/db").pool;
  let runWithScope: typeof import("@/db/scope").runWithScope;
  let adjustStock: typeof import("@/modules/stock/service").adjustStock;
  let createSale: typeof import("@/modules/sales/service").createSale;
  let cancelSale: typeof import("@/modules/sales/service").cancelSale;
  let importFiscalXmlBatch: typeof import("@/modules/fiscal/service").importFiscalXmlBatch;
  let receiveFiscalInvoiceStock: typeof import("@/modules/fiscal/stock").receiveFiscalInvoiceStock;
  let stockQuantitySql: typeof import("@/modules/stock/ledger").stockQuantitySql;
  let account: string; let lojaA: string; let lojaB: string; let userId: string; let productId: string;
  const scope = (storeId: string | null, storeIds = storeId ? [storeId] : [lojaA, lojaB]) => ({ accountId: account, storeId, storeIds });
  const inA = <T>(run: () => Promise<T>) => runWithScope(scope(lojaA), run);
  const inB = <T>(run: () => Promise<T>) => runWithScope(scope(lojaB), run);
  const levels = async () => Object.fromEntries((await pool.query<{ store_id: string; quantity: number }>("SELECT store_id,quantity FROM product_stock WHERE product_id=$1", [productId])).rows.map((row) => [row.store_id, row.quantity]));
  const sellOne = (quantity: number) => createSale({ items: [{ productId, quantity, discountBasisPoints: 0 }], payments: [{ methodCode: "PIX", amountAppliedCents: 1000 * quantity }] }, userId);

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL = url;
    ({ pool } = await import("@/db"));
    ({ runWithScope } = await import("@/db/scope"));
    ({ adjustStock } = await import("@/modules/stock/service"));
    ({ createSale, cancelSale } = await import("@/modules/sales/service"));
    ({ importFiscalXmlBatch } = await import("@/modules/fiscal/service"));
    ({ receiveFiscalInvoiceStock } = await import("@/modules/fiscal/stock"));
    ({ stockQuantitySql } = await import("@/modules/stock/ledger"));
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await resetTenancy(pool);
    account = (await pool.query<{ id: string }>("SELECT id FROM accounts")).rows[0].id;
    lojaA = (await pool.query<{ id: string }>("SELECT id FROM stores")).rows[0].id;
    lojaB = (await pool.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja B') RETURNING id", [account])).rows[0].id;
    await pool.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('PIX','PIX',1) ON CONFLICT DO NOTHING");
    userId = (await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id) VALUES ('Operador','op@estoque.test','x','ADMIN',$1) RETURNING id", [account])).rows[0].id;
    const category = (await pool.query<{ id: string }>("INSERT INTO categories(name,account_id) VALUES ('Cartas',$1) RETURNING id", [account])).rows[0].id;
    const unit = (await pool.query<{ id: string }>("INSERT INTO units(code,name) VALUES ('UN','Unidade') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id")).rows[0].id;
    productId = (await pool.query<{ id: string }>("INSERT INTO products(sku,name,category_id,unit_id,cost_cents,sale_price_cents,max_discount_bps,account_id) VALUES ('PROD-1','Booster',$1,$2,400,1000,0,$3) RETURNING id", [category, unit, account])).rows[0].id;
    await inA(() => adjustStock(productId, 10, "MANUAL_IN", "Entrada na loja A", userId));
    await inB(() => adjustStock(productId, 3, "MANUAL_IN", "Entrada na loja B", userId));
  });

  it("cada loja tem o seu saldo do mesmo produto, e o total do catálogo é a soma", async () => {
    expect(await levels()).toEqual({ [lojaA]: 10, [lojaB]: 3 });
    expect((await pool.query("SELECT stock_quantity FROM products WHERE id=$1", [productId])).rows[0].stock_quantity).toBe(13);
  });

  it("a venda baixa só o estoque da loja onde foi feita e fica registrada nela", async () => {
    const sale = await inA(() => sellOne(2));
    expect(await levels()).toEqual({ [lojaA]: 8, [lojaB]: 3 });
    expect((await pool.query("SELECT store_id FROM sales WHERE id=$1", [sale.id])).rows[0].store_id).toBe(lojaA);
    expect((await pool.query("SELECT store_id FROM stock_movements WHERE sale_id=$1", [sale.id])).rows[0].store_id).toBe(lojaA);
  });

  it("não vende mais do que a loja tem, mesmo que outra loja tenha de sobra", async () => {
    await expect(inB(() => sellOne(5))).rejects.toThrow(/Estoque insuficiente/);
    expect(await levels()).toEqual({ [lojaA]: 10, [lojaB]: 3 });
  });

  it("duas vendas concorrentes do último item da loja: só uma passa", async () => {
    await inA(() => adjustStock(productId, -9, "MANUAL_ADJUSTMENT", "Deixa uma unidade", userId));
    const results = await Promise.allSettled([inA(() => sellOne(1)), inA(() => sellOne(1))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await levels())[lojaA]).toBe(0);
  });

  it("na visão de todas as lojas a leitura soma e a gravação é recusada com orientação", async () => {
    await runWithScope(scope(null), async () => {
      expect((await pool.query<{ q: number }>(`SELECT ${stockQuantitySql("p")} AS q FROM products p WHERE p.id=$1`, [productId])).rows[0].q).toBe(13);
      await expect(adjustStock(productId, 1, "MANUAL_IN", "Sem loja ativa", userId)).rejects.toThrow(/Escolha uma loja específica/);
      await expect(sellOne(1)).rejects.toThrow(/Escolha uma loja específica/);
    });
    expect(await levels()).toEqual({ [lojaA]: 10, [lojaB]: 3 });
  });

  it("cancelar a venda devolve o estoque à loja da venda, mesmo pela visão de todas as lojas", async () => {
    const sale = await inA(() => sellOne(4));
    await runWithScope(scope(null), () => cancelSale(sale.id, "Cliente desistiu", userId));
    expect(await levels()).toEqual({ [lojaA]: 10, [lojaB]: 3 });
  });

  it("não cancela venda de uma loja que a pessoa não está vendo", async () => {
    const sale = await inA(() => sellOne(1));
    await expect(inB(() => cancelSale(sale.id, "Tentativa de outra loja", userId))).rejects.toThrow(/não está vendo/);
    expect(await levels()).toEqual({ [lojaA]: 9, [lojaB]: 3 });
  });

  it("a entrada da nota fiscal vai para a loja da nota, não para a loja ativa", async () => {
    await pool.query("TRUNCATE product_stock");
    await inA(() => importFiscalXmlBatch([{ name: "nota-123.xml", xml: fullXml }], undefined, config));
    const invoice = (await pool.query<{ id: string; store_id: string }>("SELECT id,store_id FROM fiscal_invoices")).rows[0];
    expect(invoice.store_id).toBe(lojaA);
    await expect(inB(() => receiveFiscalInvoiceStock(invoice.id, userId))).rejects.toThrow(/não está vendo/);
    const result = await runWithScope(scope(null), () => receiveFiscalInvoiceStock(invoice.id, userId));
    expect(result.entered).toBe(1);
    const entries = (await pool.query<{ store_id: string; quantity: number }>("SELECT store_id,quantity FROM product_stock")).rows;
    expect(entries).toEqual([{ store_id: lojaA, quantity: 2 }]);
  });
});
