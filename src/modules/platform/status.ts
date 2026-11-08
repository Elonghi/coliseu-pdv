import { readFile } from "node:fs/promises";
import path from "node:path";
import { rawPool } from "@/db/raw";
import { tenancy } from "@/db/tenancy";

/* Diagnóstico do isolamento entre lojistas e do estado das migrations. Usa a conexão sem escopo do app: não depende de quem
 * está logado, e só lê o catálogo do banco. */

export type IsolationStatus = {
  /** Usuário de banco com que o app conecta. */
  role: string;
  /** Verdadeiro se esse usuário ignora o RLS (superusuário ou BYPASSRLS): as travas existem, mas não valem. */
  privilegedRole: boolean;
  /** Tabelas de lojista, loja ou identidade que ainda estão sem RLS. */
  unprotected: string[];
  /** As travas do banco estão valendo para o app. */
  enforced: boolean;
};

export async function isolationStatus(): Promise<IsolationStatus> {
  const role = (await rawPool.query<{ name: string; privileged: boolean }>("SELECT current_user::text AS name,(rolsuper OR rolbypassrls) AS privileged FROM pg_roles WHERE rolname=current_user")).rows[0];
  const tables = Object.entries(tenancy).filter(([, level]) => level !== "GLOBAL").map(([name]) => name);
  const open = await rawPool.query<{ relname: string }>(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity AND c.relname=ANY($1) ORDER BY c.relname", [tables]);
  const unprotected = open.rows.map((row) => row.relname);
  return { role: role.name, privilegedRole: role.privileged, unprotected, enforced: !role.privileged && unprotected.length === 0 };
}

export type MigrationStatus = { applied: number | null; expected: number | null; pending: boolean };
let cached: { at: number; value: MigrationStatus } | undefined;

/** Quantas migrations o código espera e quantas o banco já aplicou. Sem acesso a um dos lados, não afirma que há pendência. */
export async function migrationStatus(): Promise<MigrationStatus> {
  if (cached && Date.now() - cached.at < 10_000) return cached.value;
  let expected: number | null = null;
  try { expected = (JSON.parse(await readFile(path.resolve(process.env.MIGRATIONS_FOLDER || "drizzle", "meta", "_journal.json"), "utf8")) as { entries: unknown[] }).entries.length; } catch { /* sem a pasta, não há o que comparar */ }
  let applied: number | null = null;
  try { applied = (await rawPool.query<{ n: number }>("SELECT count(*)::int n FROM drizzle.__drizzle_migrations")).rows[0].n; } catch { /* o papel do app pode não ler o controle de migrations */ }
  const value = { applied, expected, pending: applied !== null && expected !== null && applied < expected };
  cached = { at: Date.now(), value };
  return value;
}
