import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("endurecimento: unicidade por lojista, consistência entre lojas e formas de pagamento por loja", () => {
  let db: pg.Client;
  let accountA: string; let accountB: string; let storeA: string; let storeA2: string; let storeB: string;
  const one = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
  const inScope = async (account: string, run: () => Promise<unknown>) => {
    await db.query("BEGIN");
    try { await db.query("SELECT set_config('app.account_id',$1,true)", [account]); await run(); await db.query("COMMIT"); } catch (error) { await db.query("ROLLBACK"); throw error; }
  };
  const category = (account: string, name = "Cartas") => db.query("INSERT INTO categories (name,account_id) VALUES ($1,$2)", [name, account]);

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    db = new pg.Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await resetTenancy(db);
    accountA = (await one<{ id: string }>("SELECT id FROM accounts")).id;
    storeA = (await one<{ id: string }>("SELECT id FROM stores")).id;
    storeA2 = (await one<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Segunda do A') RETURNING id", [accountA])).id;
    accountB = (await one<{ id: string }>("INSERT INTO accounts (name) VALUES ('Lojista B') RETURNING id")).id;
    storeB = (await one<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja do B') RETURNING id", [accountB])).id;
  });

  it("lojistas diferentes podem ter o mesmo SKU, código de barras, categoria e fornecedor; o mesmo lojista não", async () => {
    const unit = (await one<{ id: string }>("INSERT INTO units(code,name) VALUES ('UN','Unidade') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id")).id;
    await category(accountA); await category(accountB);
    await expect(category(accountA, "CARTAS")).rejects.toThrow(/categories_account_name_lower_uidx/);
    const product = async (account: string, sku: string, barcode: string | null) => {
      const cat = (await one<{ id: string }>("SELECT id FROM categories WHERE account_id=$1", [account])).id;
      return db.query("INSERT INTO products(sku,barcode,name,category_id,unit_id,cost_cents,sale_price_cents,account_id) VALUES ($1,$2,'Produto',$3,$4,1,2,$5)", [sku, barcode, cat, unit, account]);
    };
    await product(accountA, "SKU-1", "789"); await product(accountB, "SKU-1", "789");
    await expect(product(accountA, "SKU-1", null)).rejects.toThrow(/products_scope_sku_uidx/);
    await expect(product(accountA, "SKU-2", "789")).rejects.toThrow(/products_scope_barcode_uidx/);
    await db.query("INSERT INTO suppliers(name,document,account_id) VALUES ('F','12345678000199',$1),('F','12345678000199',$2)", [accountA, accountB]);
    await expect(db.query("INSERT INTO suppliers(name,document,account_id) VALUES ('F2','12345678000199',$1)", [accountA])).rejects.toThrow(/suppliers_account_document_uidx/);
  });

  it("o nome do caixa é único por loja, não no sistema", async () => {
    await db.query("INSERT INTO cash_registers(name,store_id) VALUES ('Balcão',$1),('Balcão',$2),('Balcão',$3)", [storeA, storeA2, storeB]);
    await expect(db.query("INSERT INTO cash_registers(name,store_id) VALUES ('BALCÃO',$1)", [storeA])).rejects.toThrow(/cash_registers_store_name_lower_uidx/);
  });

  it("o banco recusa um registro filho ligado a um pai de outra loja", async () => {
    const operator = (await one<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id) VALUES ('Op','op@h.test','x','OPERATOR',$1) RETURNING id", [accountA])).id;
    const register = (await one<{ id: string }>("INSERT INTO cash_registers(name,store_id) VALUES ('Caixa',$1) RETURNING id", [storeA])).id;
    await expect(db.query("INSERT INTO cash_sessions(register_id,operator_id,opening_amount_cents,store_id) VALUES ($1,$2,0,$3)", [register, operator, storeA2])).rejects.toThrow(/de outra loja/);
    await db.query("INSERT INTO cash_sessions(register_id,operator_id,opening_amount_cents,store_id) VALUES ($1,$2,0,$3)", [register, operator, storeA]);
  });

  it("cada loja tem as suas formas de pagamento: lojas novas e formas novas aparecem em todas", async () => {
    await db.query("TRUNCATE payment_methods CASCADE");
    await db.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('PIX','PIX',1),('CASH','Dinheiro',0)");
    const methods = async (store: string) => (await db.query<{ code: string; active: boolean }>("SELECT code,active FROM store_payment_methods WHERE store_id=$1 ORDER BY code", [store])).rows;
    const stores = [storeA, storeA2, storeB];
    for (const store of stores) expect((await methods(store)).map((row) => row.code)).toEqual(["CASH", "PIX"]);
    await db.query("UPDATE store_payment_methods SET active=false WHERE store_id=$1 AND code='PIX'", [storeA]);
    expect((await methods(storeA2)).find((row) => row.code === "PIX")?.active).toBe(true);
    await db.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('VOUCHER','Voucher',9)");
    for (const store of stores) expect((await methods(store)).map((row) => row.code)).toContain("VOUCHER");
    const created = (await one<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Terceira') RETURNING id", [accountB])).id;
    expect((await methods(created)).map((row) => row.code)).toEqual(["CASH", "PIX", "VOUCHER"]);
  });

  it("todo usuário pertence a um lojista, salvo o administrador do sistema", async () => {
    await expect(db.query("INSERT INTO users(name,email,password_hash,role) VALUES ('Solto','solto@h.test','x','OPERATOR')")).rejects.toThrow(/users_account_required/);
    await inScope(accountA, () => db.query("INSERT INTO users(name,email,password_hash,role) VALUES ('Dono','dono@h.test','x','ADMIN')"));
    await db.query("INSERT INTO users(name,email,password_hash,role,is_platform_admin) VALUES ('Plataforma','plataforma@h.test','x','ADMIN',true)");
    expect((await one<{ n: number }>("SELECT count(*)::int n FROM users WHERE account_id IS NULL")).n).toBe(1);
  });

  it("o limite de lojas do lojista, quando existe, é um número positivo", async () => {
    await db.query("UPDATE accounts SET max_stores=2 WHERE id=$1", [accountA]);
    await expect(db.query("UPDATE accounts SET max_stores=0 WHERE id=$1", [accountA])).rejects.toThrow(/accounts_max_stores_valid/);
    await db.query("UPDATE accounts SET max_stores=NULL WHERE id=$1", [accountA]);
  });
});
