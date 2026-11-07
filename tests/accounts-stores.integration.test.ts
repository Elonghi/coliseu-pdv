import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defaultStoreBackfill, defaultStoreName } from "@/db/default-store";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("contas, lojas e vínculo de usuários", () => {
  let db: pg.Client;
  const backfill = async () => { for (const statement of defaultStoreBackfill) await db.query(statement); };
  const count = async (table: string) => (await db.query<{ total: number }>(`SELECT count(*)::int total FROM ${table}`)).rows[0].total;
  const addUser = async (email: string, role: "ADMIN" | "OPERATOR", createdAt: string, active = true) =>
    (await db.query<{ id: string }>("INSERT INTO users (name,email,password_hash,role,active,created_at) VALUES ($1,$2,'x',$3,$4,$5) RETURNING id", [email, `${email}@loja.test`, role, active, createdAt])).rows[0].id;

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    db = new pg.Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("TRUNCATE accounts,stores,user_stores,users RESTART IDENTITY CASCADE"); });

  it("a migration 0014 contém exatamente as instruções do vínculo inicial", () => {
    const sql = readFileSync(path.resolve("drizzle/0014_multi_conta_lojas.sql"), "utf8");
    for (const statement of defaultStoreBackfill) expect(sql).toContain(`${statement};`);
  });

  it("transforma a operação atual em uma conta com a loja Coliseu TCG e vincula todos os usuários", async () => {
    const oldInactiveAdmin = await addUser("admin-antigo-inativo", "ADMIN", "2025-01-01", false);
    const owner = await addUser("admin-ativo-antigo", "ADMIN", "2026-01-01");
    const otherAdmin = await addUser("admin-ativo-novo", "ADMIN", "2026-02-01");
    const operator = await addUser("operador", "OPERATOR", "2026-03-01");
    await backfill();

    expect(await count("accounts")).toBe(1);
    const stores = (await db.query<{ name: string; account_id: string }>("SELECT name,account_id FROM stores")).rows;
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe(defaultStoreName);
    const users = (await db.query<{ id: string; account_id: string | null; is_account_owner: boolean }>("SELECT id,account_id,is_account_owner FROM users")).rows;
    expect(users.every((user) => user.account_id === stores[0].account_id)).toBe(true);
    expect(users.filter((user) => user.is_account_owner).map((user) => user.id)).toEqual([owner]);
    expect(users.find((user) => user.id === oldInactiveAdmin)?.is_account_owner).toBe(false);
    expect(users.find((user) => user.id === otherAdmin)?.is_account_owner).toBe(false);
    expect(users.find((user) => user.id === operator)?.is_account_owner).toBe(false);
    expect(await count("user_stores")).toBe(4);
  });

  it("pode ser repetido sem criar nada novo", async () => {
    await addUser("admin", "ADMIN", "2026-01-01");
    await backfill();
    const before = [await count("accounts"), await count("stores"), await count("user_stores")];
    await backfill();
    await backfill();
    expect([await count("accounts"), await count("stores"), await count("user_stores")]).toEqual(before);
    expect((await db.query("SELECT 1 FROM users WHERE is_account_owner")).rowCount).toBe(1);
  });

  it("não cria conta nem loja num banco sem usuários", async () => {
    await backfill();
    expect([await count("accounts"), await count("stores"), await count("user_stores")]).toEqual([0, 0, 0]);
  });

  it("respeita conta e loja que já existem, sem criar outras", async () => {
    const account = (await db.query<{ id: string }>("INSERT INTO accounts (name) VALUES ('Conta existente') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO stores (account_id,name) VALUES ($1,'Loja existente')", [account]);
    await addUser("admin", "ADMIN", "2026-01-01");
    await backfill();
    expect(await count("accounts")).toBe(1);
    expect((await db.query("SELECT name FROM stores")).rows).toEqual([{ name: "Loja existente" }]);
    expect(await count("user_stores")).toBe(1);
  });

  it("garante a integridade: nome de loja único por conta, vínculo único e exclusão em cascata", async () => {
    const accountA = (await db.query<{ id: string }>("INSERT INTO accounts (name) VALUES ('A') RETURNING id")).rows[0].id;
    const accountB = (await db.query<{ id: string }>("INSERT INTO accounts (name) VALUES ('B') RETURNING id")).rows[0].id;
    const store = (await db.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Centro') RETURNING id", [accountA])).rows[0].id;
    await expect(db.query("INSERT INTO stores (account_id,name) VALUES ($1,'CENTRO')", [accountA])).rejects.toThrow(/stores_account_name_lower_uidx/);
    await db.query("INSERT INTO stores (account_id,name) VALUES ($1,'Centro')", [accountB]);
    await expect(db.query("INSERT INTO stores (account_id,name,cnpj) VALUES ($1,'Filial','123')", [accountA])).rejects.toThrow(/stores_cnpj_format/);

    const user = await addUser("operador", "OPERATOR", "2026-01-01");
    await db.query("INSERT INTO user_stores (user_id,store_id) VALUES ($1,$2)", [user, store]);
    await expect(db.query("INSERT INTO user_stores (user_id,store_id) VALUES ($1,$2)", [user, store])).rejects.toThrow(/user_stores_user_store_uidx/);
    await expect(db.query("DELETE FROM accounts WHERE id=$1", [accountA])).rejects.toThrow(/violates foreign key/);
    await db.query("DELETE FROM stores WHERE id=$1", [store]);
    expect(await count("user_stores")).toBe(0);
    expect(await count("users")).toBe(1);
  });
});
