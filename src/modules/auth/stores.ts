import type { Pool, PoolClient } from "pg";

export type StoreSummary = { id: string; name: string };
type Queryable = Pick<Pool | PoolClient, "query">;

/* Lojas ativas que o usuário `u` pode acessar, como JSON, para entrar na consulta da sessão: o lojista (titular da conta) vê todas as lojas
 * dele; os demais, só as que foram liberadas a eles (user_stores). Fica aqui, em um só lugar, para a sessão e os testes. */
export const accessibleStoresJson = `COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
  FROM stores s WHERE s.active AND s.account_id=u.account_id
    AND (u.is_account_owner OR EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id=u.id AND us.store_id=s.id))), '[]'::json)`;

export async function listAccessibleStores(db: Queryable, userId: string): Promise<StoreSummary[]> {
  const result = await db.query<{ stores: StoreSummary[] }>(`SELECT ${accessibleStoresJson} AS stores FROM users u WHERE u.id=$1`, [userId]);
  return result.rows[0]?.stores ?? [];
}

/* Vincula um usuário à conta de quem o cadastrou e às lojas informadas. Só vale loja da mesma conta: id de outra conta é ignorado.
 * Também cura usuário sem conta (criado antes do vínculo existir). Pode ser repetido. */
export async function attachUserToAccount(db: Queryable, userId: string, accountId: string, storeIds: string[]) {
  await db.query("UPDATE users SET account_id=$2,updated_at=now() WHERE id=$1 AND (account_id IS NULL OR account_id=$2)", [userId, accountId]);
  if (!storeIds.length) return;
  await db.query(`INSERT INTO user_stores (user_id,store_id)
    SELECT u.id,s.id FROM users u JOIN stores s ON s.account_id=u.account_id WHERE u.id=$1 AND u.account_id=$2 AND s.id=ANY($3::uuid[])
    ON CONFLICT DO NOTHING`, [userId, accountId, storeIds]);
}

/* O lojista (titular da conta) não pode ser desativado nem rebaixado: a conta ficaria sem quem a administre. */
export function ownerProtectionError(target: { isAccountOwner: boolean }, next: { role: string; active: boolean }) {
  if (target.isAccountOwner && (next.role !== "ADMIN" || !next.active)) return "O lojista titular da conta não pode ser desativado nem rebaixado.";
  return null;
}

export const STORE_COOKIE = "coliseu_store";
export const ALL_STORES = "all";
export type ActiveStore = { storeId: string | null; consolidated: boolean };

/* Decide a loja ativa a partir das lojas a que o usuário tem acesso e do que ele escolheu (valor do cookie).
 * Uma loja só: é ela. Várias: a escolhida, se for dele; sem escolha válida, a visão "Todas as lojas", que só lê. */
export function resolveActiveStore(stores: StoreSummary[], requested?: string | null): ActiveStore {
  if (stores.length === 0) return { storeId: null, consolidated: false };
  if (stores.length === 1) return { storeId: stores[0].id, consolidated: false };
  const chosen = stores.find((store) => store.id === requested);
  if (chosen) return { storeId: chosen.id, consolidated: false };
  return { storeId: null, consolidated: true };
}

/* Escopo de dados de quem está logado: o lojista, a loja ativa e as lojas que a requisição enxerga. */
export function scopeFor(accountId: string | null, stores: StoreSummary[], requested?: string | null) {
  const active = resolveActiveStore(stores, requested);
  return { accountId, storeId: active.storeId, storeIds: active.storeId ? [active.storeId] : stores.map((store) => store.id) };
}
