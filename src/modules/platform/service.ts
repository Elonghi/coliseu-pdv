import { hash } from "bcryptjs";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/db";
import { runWithScope } from "@/db/scope";
import { AppError } from "@/lib/errors";
import { isolationStatus } from "./status";

/* Administração do sistema: quem vende o Coliseon cria lojistas, adiciona lojas e suspende contas. Tudo roda com o escopo de
 * plataforma, que enxerga contas, lojas e usuários, mas nunca vendas, estoque, caixa, financeiro ou notas dos lojistas. */
const platformScope = { accountId: null, storeId: null, storeIds: [] as string[], platform: true };
export const asPlatform = <T>(run: () => Promise<T>) => runWithScope(platformScope, run);

const cnpj = z.string().trim().transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")).refine((value) => value === "" || /^[A-Z0-9]{14}$/.test(value), "CNPJ inválido: use 14 caracteres.");
export const newAccountSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do lojista.").max(160),
  ownerName: z.string().trim().min(2, "Informe o nome do titular.").max(120),
  ownerEmail: z.string().trim().toLowerCase().email("E-mail do titular inválido.").max(255),
  ownerPassword: z.string().min(10, "A senha do titular deve ter pelo menos 10 caracteres.").max(200),
  storeName: z.string().trim().min(2, "Informe o nome da primeira loja.").max(160),
  storeCnpj: cnpj.optional().default(""),
  maxStores: z.number().int().min(1).max(999).nullable().optional(),
  notes: z.string().trim().max(1000).optional().default(""),
});
export const newStoreSchema = z.object({ name: z.string().trim().min(2, "Informe o nome da loja.").max(160), cnpj: cnpj.optional().default("") });

const MANUAL = "Antes de criar outro lojista ou outra loja, ative o isolamento do banco: o app ainda conecta com um usuário de banco com privilégio total, e as travas existem mas não valem. Veja a seção 9 do roteiro de migração (docs/RUNBOOK_MIGRACAO.md).";

/** O primeiro lojista e a primeira loja podem ser criados sem as travas valendo; a partir do segundo, não. */
async function requireIsolationForMore(client: PoolClient, table: "accounts" | "stores") {
  const existing = (await client.query<{ n: number }>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
  if (existing >= 1 && !(await isolationStatus()).enforced) throw new AppError(MANUAL, 409, "ISOLATION_REQUIRED");
}

async function audit(client: PoolClient, actorId: string, action: string, entity: string, entityId: string, accountId: string | null, after: unknown) {
  await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after,account_id) VALUES ($1,$2,$3,$4,$5,$6)", [actorId, action, entity, entityId, JSON.stringify(after), accountId]);
}

async function transaction<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export type AccountRow = { id: string; name: string; active: boolean; max_stores: number | null; notes: string | null; created_at: Date; stores: number; users: number; owner_name: string | null; owner_email: string | null };

export async function listAccounts(): Promise<AccountRow[]> {
  return (await pool.query<AccountRow>(`SELECT a.id,a.name,a.active,a.max_stores,a.notes,a.created_at,
    (SELECT count(*)::int FROM stores s WHERE s.account_id=a.id) AS stores,
    (SELECT count(*)::int FROM users u WHERE u.account_id=a.id) AS users,
    o.name AS owner_name,o.email AS owner_email
    FROM accounts a LEFT JOIN LATERAL (SELECT name,email FROM users WHERE account_id=a.id AND is_account_owner ORDER BY created_at LIMIT 1) o ON true
    ORDER BY a.active DESC,a.name`)).rows;
}

export type StoreRow = { id: string; name: string; cnpj: string | null; active: boolean; created_at: Date };
export type TeamRow = { id: string; name: string; email: string; role: string; active: boolean; is_account_owner: boolean };

export async function getAccount(accountId: string) {
  const account = (await pool.query<AccountRow>(`SELECT a.id,a.name,a.active,a.max_stores,a.notes,a.created_at,0 AS stores,0 AS users,NULL::text AS owner_name,NULL::text AS owner_email FROM accounts a WHERE a.id=$1`, [accountId])).rows[0];
  if (!account) return null;
  const [stores, team] = await Promise.all([
    pool.query<StoreRow>("SELECT id,name,cnpj,active,created_at FROM stores WHERE account_id=$1 ORDER BY created_at", [accountId]),
    pool.query<TeamRow>("SELECT id,name,email,role,active,is_account_owner FROM users WHERE account_id=$1 ORDER BY is_account_owner DESC,active DESC,name", [accountId]),
  ]);
  return { account, stores: stores.rows, team: team.rows };
}

/** Cria o lojista com o titular e a primeira loja. O titular enxerga todas as lojas do lojista, hoje e no futuro. */
export async function createAccount(input: unknown, actorId: string) {
  const parsed = newAccountSchema.parse(input);
  const passwordHash = await hash(parsed.ownerPassword, 12);
  return transaction(async (client) => {
    await requireIsolationForMore(client, "accounts");
    const account = (await client.query<{ id: string }>("INSERT INTO accounts (name,max_stores,notes) VALUES ($1,$2,$3) RETURNING id", [parsed.name, parsed.maxStores ?? null, parsed.notes || null])).rows[0].id;
    const store = (await client.query<{ id: string }>("INSERT INTO stores (account_id,name,cnpj) VALUES ($1,$2,$3) RETURNING id", [account, parsed.storeName, parsed.storeCnpj || null])).rows[0].id;
    const owner = (await client.query<{ id: string }>("INSERT INTO users (name,email,password_hash,role,account_id,is_account_owner) VALUES ($1,$2,$3,'ADMIN',$4,true) RETURNING id", [parsed.ownerName, parsed.ownerEmail, passwordHash, account])).rows[0].id;
    await client.query("INSERT INTO user_stores (user_id,store_id) VALUES ($1,$2)", [owner, store]);
    await audit(client, actorId, "PLATFORM_ACCOUNT_CREATE", "account", account, account, { name: parsed.name, store: parsed.storeName, owner: parsed.ownerEmail, maxStores: parsed.maxStores ?? null });
    return account;
  });
}

export async function addStore(accountId: string, input: unknown, actorId: string) {
  const parsed = newStoreSchema.parse(input);
  return transaction(async (client) => {
    const account = (await client.query<{ max_stores: number | null; active: boolean }>("SELECT max_stores,active FROM accounts WHERE id=$1 FOR UPDATE", [accountId])).rows[0];
    if (!account) throw new AppError("Lojista não encontrado.", 404);
    const current = (await client.query<{ n: number }>("SELECT count(*)::int n FROM stores WHERE account_id=$1", [accountId])).rows[0].n;
    if (account.max_stores !== null && current >= account.max_stores) throw new AppError(`Este lojista já está no limite de ${account.max_stores} loja(s). Aumente o limite para adicionar outra.`, 409, "STORE_LIMIT");
    await requireIsolationForMore(client, "stores");
    const store = (await client.query<{ id: string }>("INSERT INTO stores (account_id,name,cnpj) VALUES ($1,$2,$3) RETURNING id", [accountId, parsed.name, parsed.cnpj || null])).rows[0].id;
    await audit(client, actorId, "PLATFORM_STORE_CREATE", "store", store, accountId, { name: parsed.name, cnpj: parsed.cnpj || null });
    return store;
  });
}

export async function updateAccount(accountId: string, input: { name: string; notes: string; maxStores: number | null }, actorId: string) {
  const parsed = z.object({ name: z.string().trim().min(2).max(160), notes: z.string().trim().max(1000), maxStores: z.number().int().min(1).max(999).nullable() }).parse(input);
  return transaction(async (client) => {
    const stores = (await client.query<{ n: number }>("SELECT count(*)::int n FROM stores WHERE account_id=$1", [accountId])).rows[0].n;
    if (parsed.maxStores !== null && parsed.maxStores < stores) throw new AppError(`O lojista já tem ${stores} loja(s): o limite não pode ser menor que isso.`, 409);
    const result = await client.query("UPDATE accounts SET name=$1,notes=$2,max_stores=$3,updated_at=now() WHERE id=$4", [parsed.name, parsed.notes || null, parsed.maxStores, accountId]);
    if (!result.rowCount) throw new AppError("Lojista não encontrado.", 404);
    await audit(client, actorId, "PLATFORM_ACCOUNT_UPDATE", "account", accountId, accountId, parsed);
  });
}

export async function updateStore(storeId: string, input: { name: string; cnpj: string; active: boolean }, actorId: string) {
  const parsed = z.object({ name: z.string().trim().min(2).max(160), cnpj, active: z.boolean() }).parse(input);
  return transaction(async (client) => {
    const result = await client.query<{ account_id: string }>("UPDATE stores SET name=$1,cnpj=$2,active=$3,updated_at=now() WHERE id=$4 RETURNING account_id", [parsed.name, parsed.cnpj || null, parsed.active, storeId]);
    if (!result.rows[0]) throw new AppError("Loja não encontrada.", 404);
    await audit(client, actorId, "PLATFORM_STORE_UPDATE", "store", storeId, result.rows[0].account_id, parsed);
  });
}

/** Suspender impede o login de todo mundo do lojista e derruba as sessões abertas. Os dados ficam intactos. */
export async function setAccountActive(accountId: string, active: boolean, actorId: string) {
  return transaction(async (client) => {
    const result = await client.query("UPDATE accounts SET active=$1,updated_at=now() WHERE id=$2", [active, accountId]);
    if (!result.rowCount) throw new AppError("Lojista não encontrado.", 404);
    if (!active) await client.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE account_id=$1)", [accountId]);
    await audit(client, actorId, active ? "PLATFORM_ACCOUNT_REACTIVATE" : "PLATFORM_ACCOUNT_SUSPEND", "account", accountId, accountId, { active });
  });
}

/** Define uma senha provisória para o titular e derruba as sessões dele. A senha é digitada pelo administrador do sistema, nunca exibida. */
export async function resetOwnerPassword(accountId: string, password: string, actorId: string) {
  if (password.length < 10) throw new AppError("A senha deve ter pelo menos 10 caracteres.", 422);
  const passwordHash = await hash(password, 12);
  return transaction(async (client) => {
    const owner = (await client.query<{ id: string }>("UPDATE users SET password_hash=$1,totp_enabled=false,totp_secret_encrypted=NULL,updated_at=now() WHERE account_id=$2 AND is_account_owner RETURNING id", [passwordHash, accountId])).rows[0];
    if (!owner) throw new AppError("Este lojista não tem um titular.", 404);
    await client.query("DELETE FROM sessions WHERE user_id=$1", [owner.id]);
    await audit(client, actorId, "PLATFORM_OWNER_PASSWORD_RESET", "user", owner.id, accountId, { reset: true });
  });
}
