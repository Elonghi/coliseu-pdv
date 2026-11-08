import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeColumnPending, tenancy } from "@/db/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
/* Tabelas de conta que não têm account_id próprio: são a própria conta/loja ou herdam do usuário. */
const derived = new Set(["accounts", "stores", "sessions", "user_permissions", "user_stores"]);

suite("colunas de conta e loja de cada tabela, conforme o manifesto", () => {
  let db: pg.Client;
  let columns: Map<string, Map<string, { nullable: boolean; fallback: string | null }>>;

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    db = new pg.Client({ connectionString: url });
    await db.connect();
    const rows = (await db.query<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }>(
      "SELECT table_name,column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public'")).rows;
    columns = new Map();
    for (const row of rows) {
      if (!columns.has(row.table_name)) columns.set(row.table_name, new Map());
      columns.get(row.table_name)!.set(row.column_name, { nullable: row.is_nullable === "YES", fallback: row.column_default });
    }
  });
  afterAll(async () => { await db?.end(); });

  const existing = (level: string) => Object.entries(tenancy).filter(([name, value]) => value === level && columns.has(name)).map(([name]) => name);

  it("toda tabela de loja tem store_id obrigatório, com padrão e chave para stores", () => {
    const tables = existing("STORE").filter((name) => !storeColumnPending.includes(name));
    expect(tables.length).toBeGreaterThanOrEqual(24);
    for (const table of tables) {
      const column = columns.get(table)!.get("store_id");
      expect(column, `${table} sem store_id`).toBeDefined();
      expect(column!.nullable, `${table}.store_id deve ser NOT NULL`).toBe(false);
      expect(column!.fallback, `${table}.store_id sem padrão`).toContain("app_current_store");
    }
  });

  it("toda tabela compartilhável tem account_id obrigatório e store_id opcional (vazio = compartilhado)", () => {
    const tables = existing("SHAREABLE");
    expect(tables.sort()).toEqual(["categories", "players", "products", "supplier_product_mappings", "suppliers"]);
    for (const table of tables) {
      const account = columns.get(table)!.get("account_id");
      expect(account?.nullable, `${table}.account_id deve ser NOT NULL`).toBe(false);
      expect(account?.fallback).toContain("app_current_account");
      expect(columns.get(table)!.get("store_id")?.nullable, `${table}.store_id deve aceitar vazio`).toBe(true);
    }
  });

  it("usuários e auditoria têm conta com padrão, ainda opcional até o endurecimento", () => {
    for (const table of ["users", "audit_logs"]) {
      const account = columns.get(table)!.get("account_id");
      expect(account?.nullable).toBe(true);
      expect(account?.fallback).toContain("app_current_account");
    }
    expect(columns.get("audit_logs")!.get("store_id")?.nullable).toBe(true);
  });

  it("as demais tabelas de conta herdam do usuário ou são a própria estrutura, e as globais não têm conta nem loja", () => {
    for (const table of derived) expect(columns.has(table)).toBe(true);
    for (const table of existing("GLOBAL")) {
      expect(columns.get(table)!.has("account_id")).toBe(false);
      expect(columns.get(table)!.has("store_id")).toBe(false);
    }
  });

  it("nenhuma tabela do banco fica fora do manifesto (evita esquecer ao criar uma nova)", () => {
    const unclassified = [...columns.keys()].filter((name) => !(name in tenancy));
    expect(unclassified).toEqual([]);
  });
});
