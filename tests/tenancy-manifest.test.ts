import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { tenancy } from "@/db/tenancy";

const tables = Object.values(schema).filter((value) => is(value, PgTable)).map((table) => getTableName(table as PgTable)).sort();

describe("manifesto de isolamento por conta e por loja", () => {
  it("classifica toda tabela do schema", () => {
    const unclassified = tables.filter((name) => !(name in tenancy));
    expect(unclassified, `Classifique em src/db/tenancy.ts: ${unclassified.join(", ")}`).toEqual([]);
  });

  it("encontra as tabelas do schema (evita passar vazio)", () => {
    expect(tables.length).toBeGreaterThanOrEqual(35);
  });

  it("mantém a coerência com o plano: loja para operação, conta para acesso", () => {
    for (const name of ["sales", "payments", "cash_sessions", "stock_movements", "financial_settlements", "fiscal_invoices", "sefaz_sync_states"]) expect(tenancy[name as keyof typeof tenancy]).toBe("STORE");
    for (const name of ["users", "sessions", "user_permissions"]) expect(tenancy[name as keyof typeof tenancy]).toBe("ACCOUNT");
    for (const name of ["products", "categories", "suppliers", "players"]) expect(tenancy[name as keyof typeof tenancy]).toBe("SHAREABLE");
  });
});
