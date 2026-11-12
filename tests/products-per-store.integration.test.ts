import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("produtos por loja: cada loja com o seu catálogo", () => {
  let pool: typeof import("@/db").pool;
  let runWithScope: typeof import("@/db/scope").runWithScope;
  let createProduct: typeof import("@/modules/catalog/service").createProduct;
  let productOfActiveStoreSql: typeof import("@/modules/stock/ledger").productOfActiveStoreSql;
  let account: string; let lojaA: string; let lojaB: string; let userId: string; let category: string; let unit: string;
  const scope = (storeId: string | null) => ({ accountId: account, storeId, storeIds: storeId ? [storeId] : [lojaA, lojaB] });
  const insert = (sku: string, barcode: string | null, storeId: string | null) =>
    pool.query<{ id: string }>("INSERT INTO products(sku,barcode,name,category_id,unit_id,cost_cents,sale_price_cents,account_id,store_id) VALUES ($1,$2,'Produto',$3,$4,1,2,$5,$6) RETURNING id", [sku, barcode, category, unit, account, storeId]);
  const input = (sku: string) => ({ sku, name: "Booster", categoryId: category, unitId: unit, costCents: 100, salePriceCents: 300, maxDiscountBps: 0, minimumStock: 0 });

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL = url;
    ({ pool } = await import("@/db"));
    ({ runWithScope } = await import("@/db/scope"));
    ({ createProduct } = await import("@/modules/catalog/service"));
    ({ productOfActiveStoreSql } = await import("@/modules/stock/ledger"));
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await resetTenancy(pool);
    account = (await pool.query<{ id: string }>("SELECT id FROM accounts")).rows[0].id;
    lojaA = (await pool.query<{ id: string }>("SELECT id FROM stores")).rows[0].id;
    lojaB = (await pool.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja B') RETURNING id", [account])).rows[0].id;
    userId = (await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id) VALUES ('Admin','admin@produtos.test','x','ADMIN',$1) RETURNING id", [account])).rows[0].id;
    category = (await pool.query<{ id: string }>("INSERT INTO categories(name,account_id) VALUES ('Cartas',$1) RETURNING id", [account])).rows[0].id;
    unit = (await pool.query<{ id: string }>("INSERT INTO units(code,name) VALUES ('UN','Unidade') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id")).rows[0].id;
  });

  it("o mesmo SKU e código de barras podem existir em lojas diferentes; repetir na mesma loja é recusado", async () => {
    await insert("BST-1", "7890000000001", lojaA);
    await insert("BST-1", "7890000000001", lojaB);
    await expect(insert("BST-1", null, lojaA)).rejects.toThrow(/products_scope_sku_uidx/);
    await expect(insert("BST-2", "7890000000001", lojaA)).rejects.toThrow(/products_scope_barcode_uidx/);
  });

  it("produto compartilhado e produto de uma loja não repetem SKU nem código de barras (a loja enxergaria os dois)", async () => {
    await insert("COMUM-1", "7890000000010", null);
    await expect(insert("COMUM-1", null, lojaA)).rejects.toThrow(/compartilhado ou de outra loja/);
    await expect(insert("OUTRO", "7890000000010", lojaB)).rejects.toThrow(/compartilhado ou de outra loja/);
    await insert("DA-A", "7890000000020", lojaA);
    await expect(insert("DA-A", null, null)).rejects.toThrow(/compartilhado ou de outra loja/);
    const moved = (await insert("MOVER", null, lojaB)).rows[0].id;
    await insert("MOVER-2", null, null);
    // tornar compartilhado um produto cujo SKU já é de outra loja também é recusado
    await expect(pool.query("UPDATE products SET store_id=NULL,sku='DA-A' WHERE id=$1", [moved])).rejects.toThrow(/compartilhado ou de outra loja/);
  });

  it("uma loja não usa o produto de outra: saldo, movimento, venda, compra e nota são da loja do produto", async () => {
    const produtoDaA = (await insert("SO-A", null, lojaA)).rows[0].id;
    await expect(pool.query("INSERT INTO product_stock(product_id,store_id,quantity,cost_cents) VALUES ($1,$2,1,1)", [produtoDaA, lojaB])).rejects.toThrow(/de outra loja/);
    await expect(pool.query("INSERT INTO stock_movements(product_id,store_id,type,quantity_delta,previous_quantity,new_quantity) VALUES ($1,$2,'MANUAL_IN',1,0,1)", [produtoDaA, lojaB])).rejects.toThrow(/de outra loja/);
    await pool.query("INSERT INTO product_stock(product_id,store_id,quantity,cost_cents) VALUES ($1,$2,1,1)", [produtoDaA, lojaA]);
    // o produto compartilhado vale em qualquer loja
    const comum = (await insert("COMUM-2", null, null)).rows[0].id;
    await pool.query("INSERT INTO product_stock(product_id,store_id,quantity,cost_cents) VALUES ($1,$2,1,1),($1,$3,2,1)", [comum, lojaA, lojaB]);
  });

  it("produto novo nasce na loja ativa; na visão de todas as lojas o cadastro é recusado", async () => {
    const id = await runWithScope(scope(lojaB), () => createProduct(input("NOVO-B"), 0, userId));
    expect((await pool.query("SELECT store_id FROM products WHERE id=$1", [id])).rows[0].store_id).toBe(lojaB);
    await expect(runWithScope(scope(null), () => createProduct(input("NOVO-X"), 0, userId))).rejects.toThrow(/Escolha uma loja específica.*cadastrar o produto/);
    expect((await pool.query("SELECT 1 FROM products WHERE sku='NOVO-X'")).rowCount).toBe(0);
    // o mesmo SKU em outra loja é outro produto, e na mesma loja é duplicado
    await runWithScope(scope(lojaA), () => createProduct(input("NOVO-B"), 0, userId));
    await expect(runWithScope(scope(lojaA), () => createProduct(input("NOVO-B"), 0, userId))).rejects.toThrow(/já cadastrado/);
  });

  it("a consulta da loja ativa enxerga os produtos dela e os compartilhados, e nunca os de outra loja", async () => {
    await insert("A-1", null, lojaA); await insert("B-1", null, lojaB); await insert("COMUM-3", null, null);
    const visible = (storeId: string) => runWithScope(scope(storeId), async () => (await pool.query<{ sku: string }>(`SELECT p.sku FROM products p WHERE ${productOfActiveStoreSql("p")} ORDER BY p.sku`)).rows.map((row) => row.sku));
    expect(await visible(lojaA)).toEqual(["A-1", "COMUM-3"]);
    expect(await visible(lojaB)).toEqual(["B-1", "COMUM-3"]);
  });

  it("o pedido de compra de uma loja recusa produto de outra, com mensagem clara, e aceita o da própria loja", async () => {
    const { createPurchaseOrder, addPurchaseItem } = await import("@/modules/purchases/service");
    const supplierId = (await pool.query<{ id: string }>("INSERT INTO suppliers(name,document,account_id) VALUES ('Fornecedor','12345678000199',$1) RETURNING id", [account])).rows[0].id;
    const daA = (await insert("COMPRA-A", null, lojaA)).rows[0].id;
    const daB = (await insert("COMPRA-B", null, lojaB)).rows[0].id;
    const orderId = await runWithScope(scope(lojaA), () => createPurchaseOrder({ supplierId }, userId));
    await runWithScope(scope(lojaA), () => addPurchaseItem({ orderId, productId: daA, quantity: 2, unitCostCents: 100 }, userId));
    await expect(runWithScope(scope(lojaA), () => addPurchaseItem({ orderId, productId: daB, quantity: 2, unitCostCents: 100 }, userId))).rejects.toThrow(/produto é de outra loja/);
    expect((await pool.query("SELECT count(*)::int n FROM purchase_order_items WHERE order_id=$1", [orderId])).rows[0].n).toBe(1);
  });

  describe("ajuste dos produtos que já existiam (migration 0019)", () => {
    const statements = readFileSync("drizzle/0019_produtos_por_loja.sql", "utf8").split("--> statement-breakpoint")
      .filter((statement) => /UPDATE "(products|supplier_product_mappings)"/.test(statement) && !/CREATE /.test(statement));
    const owner = async (id: string) => (await pool.query<{ store_id: string | null }>("SELECT store_id FROM products WHERE id=$1", [id])).rows[0].store_id;

    it("lojista com uma loja só leva todos os produtos para a loja; com várias, cada produto vai para a loja que o usa", async () => {
      expect(statements).toHaveLength(3);
      // lojista com uma loja só
      const outra = (await pool.query<{ id: string }>("INSERT INTO accounts (name) VALUES ('Outro lojista') RETURNING id")).rows[0].id;
      const lojaUnica = (await pool.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja única') RETURNING id", [outra])).rows[0].id;
      const unico = (await pool.query<{ id: string }>("INSERT INTO products(sku,name,category_id,unit_id,cost_cents,sale_price_cents,account_id,store_id) SELECT 'UNICO','Produto',c.id,$2,1,2,$1,NULL FROM categories c WHERE c.account_id=$3 LIMIT 1 RETURNING id", [outra, unit, account])).rows[0].id;
      // lojista com duas lojas (a conta do teste): usado só na A, nas duas, e em nenhuma
      const soA = (await insert("SO-A", null, null)).rows[0].id;
      const nasDuas = (await insert("NAS-DUAS", null, null)).rows[0].id;
      const semUso = (await insert("SEM-USO", null, null)).rows[0].id;
      await pool.query("INSERT INTO product_stock(product_id,store_id,quantity,cost_cents) VALUES ($1,$2,5,1),($3,$2,1,1),($3,$4,1,1)", [soA, lojaA, nasDuas, lojaB]);
      await pool.query("INSERT INTO supplier_product_mappings(supplier_document,supplier_product_code,product_id,account_id) VALUES ('12345678000199','X-1',$1,$2)", [soA, account]);

      for (const statement of statements) await pool.query(statement);

      expect(await owner(unico)).toBe(lojaUnica);
      expect(await owner(soA)).toBe(lojaA);
      expect(await owner(nasDuas)).toBeNull();
      expect(await owner(semUso)).toBeNull();
      expect((await pool.query("SELECT store_id FROM supplier_product_mappings WHERE product_id=$1", [soA])).rows[0].store_id).toBe(lojaA);
      // repetir não muda nada
      for (const statement of statements) await pool.query(statement);
      expect(await owner(soA)).toBe(lojaA);
      expect(await owner(nasDuas)).toBeNull();
    });
  });
});
