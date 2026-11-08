import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { tenancy } from "@/db/tenancy";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const role = "coliseu_rls_test";
type Scope = { account?: string; stores?: string[]; platform?: boolean };

suite("travas no banco (RLS), como o papel sem privilégio do app", () => {
  let owner: pg.Client;
  const password = randomBytes(27).toString("base64url");
  let a: string; let b: string; let storeA: string; let storeA2: string; let storeB: string;
  let userA: string; let userB: string;

  const names = async <T extends pg.QueryResultRow>(client: pg.Client, sql: string, key = "name") => (await client.query<T>(sql)).rows.map((row) => String(row[key])).sort();
  const asApp = async <T>(scope: Scope, run: (client: pg.Client) => Promise<T>) => {
    const target = new URL(url!); target.username = role; target.password = password;
    const client = new pg.Client({ connectionString: target.toString() });
    await client.connect();
    try {
      await client.query("SELECT set_config('app.account_id',$1,false),set_config('app.store_ids',$2,false),set_config('app.platform',$3,false)", [scope.account ?? "", (scope.stores ?? []).join(","), scope.platform ? "true" : ""]);
      return await run(client);
    } finally { await client.end(); }
  };
  const one = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await owner.query<T>(sql, params)).rows[0];

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    owner = new pg.Client({ connectionString: url });
    await owner.connect();
    execFileSync(process.execPath, [path.resolve("scripts/create-app-role.mjs")], { env: { ...process.env, DATABASE_URL: url!, APP_DB_ROLE: role, APP_DB_PASSWORD: password }, stdio: "pipe" });
  });
  afterAll(async () => {
    await owner?.query(`DROP OWNED BY ${role}`).catch(() => undefined);
    await owner?.query(`DROP ROLE IF EXISTS ${role}`);
    await owner?.end();
  });
  beforeEach(async () => {
    await resetTenancy(owner);
    a = (await one<{ id: string }>("SELECT id FROM accounts")).id;
    storeA = (await one<{ id: string }>("SELECT id FROM stores")).id;
    storeA2 = (await one<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja A2') RETURNING id", [a])).id;
    b = (await one<{ id: string }>("INSERT INTO accounts (name) VALUES ('Lojista B') RETURNING id")).id;
    storeB = (await one<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja B') RETURNING id", [b])).id;
    await owner.query("INSERT INTO cash_registers(name,store_id) VALUES ('Caixa A',$1),('Caixa A2',$2),('Caixa B',$3)", [storeA, storeA2, storeB]);
    await owner.query("INSERT INTO categories(name,account_id,store_id) VALUES ('Compartilhada A',$1,NULL),('Só da A2',$1,$2),('Categoria B',$3,NULL)", [a, storeA2, b]);
    userA = (await one<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id) VALUES ('Pessoa A','a@rls.test','x','ADMIN',$1) RETURNING id", [a])).id;
    userB = (await one<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id) VALUES ('Pessoa B','b@rls.test','x','ADMIN',$1) RETURNING id", [b])).id;
    await owner.query("INSERT INTO user_permissions(user_id,permission) VALUES ($1,'FINANCE_MANAGE'),($2,'STOCK_MANAGE')", [userA, userB]);
    await owner.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('hash-a',$1,now()+interval '1 day'),('hash-b',$2,now()+interval '1 day')", [userA, userB]);
    await owner.query("INSERT INTO audit_logs(action,entity_type,entity_id,account_id) VALUES ('X','t','1',$1),('X','t','2',$2),('P','t','3',NULL)", [a, b]);
  });

  it("toda tabela de lojista, loja ou identidade tem RLS ligado e ao menos uma política", async () => {
    const tables = Object.entries(tenancy).filter(([, level]) => level !== "GLOBAL").map(([name]) => name);
    const rows = (await owner.query<{ relname: string; relrowsecurity: boolean; policies: number }>(
      `SELECT c.relname,c.relrowsecurity,(SELECT count(*)::int FROM pg_policies p WHERE p.tablename=c.relname AND p.schemaname='public') policies
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1)`, [tables])).rows;
    expect(rows.length).toBeGreaterThanOrEqual(35);
    for (const row of rows) { expect(row.relrowsecurity, `${row.relname} sem RLS`).toBe(true); expect(row.policies, `${row.relname} sem política`).toBeGreaterThan(0); }
  });

  it("cada loja só enxerga os próprios caixas; sem escopo não se enxerga nada", async () => {
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT name FROM cash_registers"))).toEqual(["Caixa A"]);
    expect(await asApp({ account: a, stores: [storeA, storeA2] }, (c) => names(c, "SELECT name FROM cash_registers"))).toEqual(["Caixa A", "Caixa A2"]);
    expect(await asApp({ account: b, stores: [storeB] }, (c) => names(c, "SELECT name FROM cash_registers"))).toEqual(["Caixa B"]);
    expect(await asApp({}, (c) => names(c, "SELECT name FROM cash_registers"))).toEqual([]);
    expect(await asApp({ platform: true }, (c) => names(c, "SELECT name FROM cash_registers"))).toEqual([]);
  });

  it("não deixa gravar nem mover linha para loja fora do escopo", async () => {
    await asApp({ account: a, stores: [storeA] }, async (c) => {
      await c.query("INSERT INTO cash_registers(name,store_id) VALUES ('Novo A',$1)", [storeA]);
      await expect(c.query("INSERT INTO cash_registers(name,store_id) VALUES ('Intruso',$1)", [storeB])).rejects.toThrow(/row-level security/);
      await expect(c.query("INSERT INTO cash_registers(name,store_id) VALUES ('Outra loja do mesmo lojista',$1)", [storeA2])).rejects.toThrow(/row-level security/);
      await expect(c.query("UPDATE cash_registers SET store_id=$1 WHERE name='Caixa A'", [storeB])).rejects.toThrow(/row-level security/);
      expect((await c.query("UPDATE cash_registers SET name='Caixa B' WHERE name='Caixa B'")).rowCount).toBe(0);
      expect((await c.query("DELETE FROM cash_registers WHERE name='Caixa B'")).rowCount).toBe(0);
    });
    expect((await one<{ n: number }>("SELECT count(*)::int n FROM cash_registers")).n).toBe(4);
  });

  it("dados compartilháveis: o que é do lojista aparece em todas as lojas dele; o que é de uma loja só nela; nada do outro lojista", async () => {
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT name FROM categories"))).toEqual(["Compartilhada A"]);
    expect(await asApp({ account: a, stores: [storeA2] }, (c) => names(c, "SELECT name FROM categories"))).toEqual(["Compartilhada A", "Só da A2"]);
    expect(await asApp({ account: a, stores: [storeA, storeA2] }, (c) => names(c, "SELECT name FROM categories"))).toEqual(["Compartilhada A", "Só da A2"]);
    expect(await asApp({ account: b, stores: [storeB] }, (c) => names(c, "SELECT name FROM categories"))).toEqual(["Categoria B"]);
    await asApp({ account: a, stores: [storeA] }, async (c) => {
      await expect(c.query("INSERT INTO categories(name,account_id) VALUES ('Roubada',$1)", [b])).rejects.toThrow(/row-level security/);
      await expect(c.query("INSERT INTO categories(name,account_id,store_id) VALUES ('Da loja errada',$1,$2)", [a, storeA2])).rejects.toThrow(/row-level security/);
    });
  });

  it("usuários, permissões e sessões: cada lojista só vê os seus; sem escopo (login) acha todos; o administrador do sistema vê todos", async () => {
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT email AS name FROM users"))).toEqual(["a@rls.test"]);
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT permission AS name FROM user_permissions"))).toEqual(["FINANCE_MANAGE"]);
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT token_hash AS name FROM sessions"))).toEqual(["hash-a"]);
    expect(await asApp({}, (c) => names(c, "SELECT email AS name FROM users"))).toEqual(["a@rls.test", "b@rls.test"]);
    expect(await asApp({ platform: true }, (c) => names(c, "SELECT email AS name FROM users"))).toEqual(["a@rls.test", "b@rls.test"]);
    await asApp({ account: a, stores: [storeA] }, async (c) => {
      await expect(c.query("INSERT INTO users(name,email,password_hash,role,account_id) VALUES ('Invasor','i@rls.test','x','ADMIN',$1)", [b])).rejects.toThrow(/row-level security/);
      await expect(c.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('hash-x',$1,now()+interval '1 day')", [userB])).rejects.toThrow(/row-level security/);
    });
  });

  it("contas e lojas: o lojista vê só as dele; o administrador do sistema vê todas", async () => {
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT name FROM accounts"))).toEqual(["Lojista de teste"]);
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT name FROM stores"))).toEqual(["Loja A2", "Loja de teste"]);
    expect(await asApp({ platform: true }, (c) => names(c, "SELECT name FROM accounts"))).toEqual(["Lojista B", "Lojista de teste"]);
    await asApp({ account: a, stores: [storeA] }, async (c) => {
      await expect(c.query("INSERT INTO stores(account_id,name) VALUES ($1,'Loja pirata')", [b])).rejects.toThrow(/row-level security/);
    });
  });

  it("auditoria: leitura só do próprio lojista; gravação sem escopo é permitida (login)", async () => {
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT entity_id AS name FROM audit_logs"))).toEqual(["1"]);
    expect(await asApp({ platform: true }, (c) => names(c, "SELECT entity_id AS name FROM audit_logs"))).toEqual(["1", "2", "3"]);
    expect(await asApp({}, (c) => names(c, "SELECT entity_id AS name FROM audit_logs"))).toEqual([]);
    await asApp({}, async (c) => { await c.query("INSERT INTO audit_logs(action,entity_type,entity_id) VALUES ('LOGIN','user','9')"); });
    await asApp({ account: a, stores: [storeA] }, async (c) => {
      await expect(c.query("INSERT INTO audit_logs(action,entity_type,entity_id,account_id) VALUES ('X','t','8',$1)", [b])).rejects.toThrow(/row-level security/);
    });
  });

  it("o estoque e as formas de pagamento seguem a loja; o catálogo de formas é global", async () => {
    await owner.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('PIX','PIX',1) ON CONFLICT DO NOTHING");
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT store_id::text AS name FROM store_payment_methods WHERE code='PIX'"))).toEqual([storeA]);
    expect((await asApp({ account: b, stores: [storeB] }, (c) => c.query("SELECT 1 FROM payment_methods WHERE code='PIX'"))).rowCount).toBe(1);
  });

  it("o administrador do sistema lê o estado da sincronização fiscal de todas as lojas, mas não as vendas", async () => {
    await owner.query("INSERT INTO sefaz_sync_states(company_cnpj,environment,uf_code,store_id) VALUES ('11111111000111','HOMOLOGATION',35,$1),('22222222000122','HOMOLOGATION',35,$2)", [storeA, storeB]);
    expect(await asApp({ platform: true }, (c) => names(c, "SELECT company_cnpj AS name FROM sefaz_sync_states"))).toEqual(["11111111000111", "22222222000122"]);
    expect(await asApp({ account: a, stores: [storeA] }, (c) => names(c, "SELECT company_cnpj AS name FROM sefaz_sync_states"))).toEqual(["11111111000111"]);
    expect(await asApp({ platform: true }, (c) => names(c, "SELECT id::text AS name FROM sales"))).toEqual([]);
  });
});
