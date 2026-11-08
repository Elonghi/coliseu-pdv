import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("padrões de conta e loja (separação dos dados)", () => {
  let db: pg.Client;
  let account: string;
  let loja: string;
  const insertRegister = (name: string) => db.query<{ store_id: string }>("INSERT INTO cash_registers (name) VALUES ($1) RETURNING store_id", [name]);
  const insertCategory = (name: string) => db.query<{ account_id: string; store_id: string | null }>("INSERT INTO categories (name) VALUES ($1) RETURNING account_id,store_id", [name]);
  const inTransaction = async (config: string, run: () => Promise<unknown>) => {
    await db.query("BEGIN");
    try { await db.query(config); await run(); await db.query("COMMIT"); } catch (error) { await db.query("ROLLBACK"); throw error; }
  };

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    db = new pg.Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await resetTenancy(db);
    account = (await db.query<{ id: string }>("SELECT id FROM accounts")).rows[0].id;
    loja = (await db.query<{ id: string }>("SELECT id FROM stores")).rows[0].id;
  });

  it("com uma única loja, o código atual grava na loja certa sem informar nada", async () => {
    expect((await insertRegister("Caixa 1")).rows[0].store_id).toBe(loja);
    const category = (await insertCategory("Cartas")).rows[0];
    expect(category.account_id).toBe(account);
    expect(category.store_id).toBeNull();
  });

  it("com duas lojas e sem loja ativa informada, a gravação falha em vez de misturar dados", async () => {
    await db.query("INSERT INTO stores (account_id,name) VALUES ($1,'Segunda loja')", [account]);
    await expect(insertRegister("Caixa 2")).rejects.toThrow(/null value in column "store_id"/);
    expect((await insertCategory("Ainda funciona")).rows[0].account_id).toBe(account);
  });

  it("com duas lojas, a loja ativa da sessão (app.store_id) decide onde grava", async () => {
    const segunda = (await db.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Segunda loja') RETURNING id", [account])).rows[0].id;
    await inTransaction(`SELECT set_config('app.store_id', '${segunda}', true)`, async () => {
      expect((await insertRegister("Caixa da segunda")).rows[0].store_id).toBe(segunda);
    });
    await inTransaction(`SELECT set_config('app.store_id', '${loja}', true)`, async () => {
      expect((await insertRegister("Caixa da primeira")).rows[0].store_id).toBe(loja);
    });
  });

  it("com dois lojistas, a conta ativa da sessão (app.account_id) decide; sem ela a gravação falha", async () => {
    const outra = (await db.query<{ id: string }>("INSERT INTO accounts (name) VALUES ('Outro lojista') RETURNING id")).rows[0].id;
    await expect(insertCategory("Sem conta ativa")).rejects.toThrow(/null value in column "account_id"/);
    await inTransaction(`SELECT set_config('app.account_id', '${outra}', true)`, async () => {
      expect((await insertCategory("Do outro lojista")).rows[0].account_id).toBe(outra);
    });
  });

  it("o valor da sessão vale só dentro da transação e nunca vaza para a próxima", async () => {
    const segunda = (await db.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Segunda loja') RETURNING id", [account])).rows[0].id;
    await inTransaction(`SELECT set_config('app.store_id', '${segunda}', true)`, async () => { await insertRegister("Dentro"); });
    await expect(insertRegister("Fora")).rejects.toThrow(/null value in column "store_id"/);
  });

  it("não aceita loja que não existe", async () => {
    await expect(inTransaction("SELECT set_config('app.store_id', '00000000-0000-4000-8000-000000000000', true)", async () => { await insertRegister("Fantasma"); })).rejects.toThrow(/violates foreign key/);
  });

  it("sem nenhuma loja cadastrada o padrão é vazio", async () => {
    await db.query("TRUNCATE accounts RESTART IDENTITY CASCADE");
    expect((await db.query("SELECT app_current_store() AS s, app_current_account() AS a")).rows[0]).toEqual({ s: null, a: null });
  });
});
