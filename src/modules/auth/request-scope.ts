import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { rawPool } from "@/db/raw";
import type { DbScope } from "@/db/scope";
import { accessibleStoresJson, scopeFor, STORE_COOKIE, type StoreSummary } from "./stores";

export const SESSION_COOKIE = "coliseu_session";
export const hashSessionToken = (value: string) => createHash("sha256").update(value).digest("hex");

/* Escopo da requisição atual, pela sessão e pelo cookie da loja. Sem importar "server-only" de propósito: o módulo é
 * carregado de dentro do pool do banco, que também roda no worker, em scripts e em testes (onde não há requisição e
 * a leitura dos cookies falha, resultando em "sem escopo"). Cada requisição de página faz vários usos do banco; a
 * resposta fica 2 segundos em memória para não consultar a sessão a cada um. */
const TTL_MS = 2000;
const cache = new Map<string, { expires: number; value: Promise<DbScope | null> }>();

async function load(token: string, requestedStore: string): Promise<DbScope | null> {
  const result = await rawPool.query<{ accountId: string | null; stores: StoreSummary[] }>(
    `SELECT u.account_id AS "accountId", ${accessibleStoresJson} AS stores
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`, [hashSessionToken(token)]);
  const row = result.rows[0];
  return row ? scopeFor(row.accountId, row.stores, requestedStore) : null;
}

export async function resolveRequestScope(): Promise<DbScope | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const requestedStore = jar.get(STORE_COOKIE)?.value ?? "";
  const key = `${token}|${requestedStore}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  if (cache.size > 500) for (const [stale, entry] of cache) if (entry.expires <= now) cache.delete(stale);
  const value = load(token, requestedStore);
  cache.set(key, { expires: now + TTL_MS, value });
  value.catch(() => cache.delete(key));
  return value;
}
