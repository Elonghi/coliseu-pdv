import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("pool com escopo de lojista e loja", () => {
  let pool: typeof import("@/db").pool;
  let runWithScope: typeof import("@/db/scope").runWithScope;
  let account: string; let primeira: string; let segunda: string;
  const scopeOf = (storeId: string | null, storeIds = storeId ? [storeId] : [primeira, segunda]) => ({ accountId: account, storeId, storeIds });
  const register = (name: string) => pool.query<{ store_id: string }>("INSERT INTO cash_registers (name) VALUES ($1) RETURNING store_id", [name]);

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL = url;
    ({ pool } = await import("@/db"));
    ({ runWithScope } = await import("@/db/scope"));
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await resetTenancy(pool);
    account = (await pool.query<{ id: string }>("SELECT id FROM accounts")).rows[0].id;
    primeira = (await pool.query<{ id: string }>("SELECT id FROM stores")).rows[0].id;
    segunda = (await pool.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Segunda loja') RETURNING id", [account])).rows[0].id;
  });

  it("sem escopo, com duas lojas, a gravação falha: nada é escolhido por acaso", async () => {
    await expect(register("Sem escopo")).rejects.toThrow(/null value in column "store_id"/);
  });

  it("grava na loja ativa da requisição, e o banco enxerga o escopo", async () => {
    await runWithScope(scopeOf(segunda), async () => {
      expect((await register("Caixa da segunda")).rows[0].store_id).toBe(segunda);
      const seen = (await pool.query<{ account: string; store: string; stores: string }>("SELECT current_setting('app.account_id') account,current_setting('app.store_id') store,current_setting('app.store_ids') stores")).rows[0];
      expect(seen).toEqual({ account, store: segunda, stores: segunda });
    });
  });

  it("o escopo não vaza: a conexão volta limpa para o pool", async () => {
    await runWithScope(scopeOf(segunda), async () => { await register("Dentro"); });
    await expect(register("Fora")).rejects.toThrow(/null value in column "store_id"/);
    const seen = (await pool.query<{ store: string }>("SELECT current_setting('app.store_id', true) store")).rows[0];
    expect(seen.store ?? "").toBe("");
  });

  it("transação com connect(): o escopo vale do começo ao fim, inclusive depois de um ROLLBACK, e é limpo ao devolver", async () => {
    await runWithScope(scopeOf(primeira), async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO cash_registers (name) VALUES ('Na transação')");
        await client.query("ROLLBACK");
        await client.query("BEGIN");
        const row = (await client.query<{ store_id: string }>("INSERT INTO cash_registers (name) VALUES ('Depois do rollback') RETURNING store_id")).rows[0];
        expect(row.store_id).toBe(primeira);
        await client.query("COMMIT");
      } finally { client.release(); }
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await pool.query("SELECT count(*)::int n FROM cash_registers")).rows[0].n).toBe(1);
    await expect(register("Fora")).rejects.toThrow(/null value in column "store_id"/);
  });

  it("requisições paralelas de lojas diferentes não se misturam", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => {
      const store = index % 2 ? primeira : segunda;
      return runWithScope(scopeOf(store), async () => ({ store, saved: (await register(`Caixa ${index}`)).rows[0].store_id }));
    }));
    for (const result of results) expect(result.saved).toBe(result.store);
  });

  it("na visão de todas as lojas não existe loja ativa: gravar falha, e o banco sabe quais lojas a requisição vê", async () => {
    await runWithScope(scopeOf(null), async () => {
      await expect(register("Consolidada")).rejects.toThrow(/null value in column "store_id"/);
      const seen = (await pool.query<{ stores: string }>("SELECT current_setting('app.store_ids') stores")).rows[0];
      expect(seen.stores.split(",").sort()).toEqual([primeira, segunda].sort());
    });
  });

  it("uma consulta que falha dentro do escopo não deixa a conexão suja", async () => {
    await runWithScope(scopeOf(segunda), async () => {
      await expect(pool.query("SELECT * FROM tabela_que_nao_existe")).rejects.toThrow();
    });
    await expect(register("Fora")).rejects.toThrow(/null value in column "store_id"/);
  });
});
