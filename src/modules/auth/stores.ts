import type { Pool, PoolClient } from "pg";

export type StoreSummary = { id: string; name: string };
type Queryable = Pick<Pool | PoolClient, "query">;

/* Lojas ativas que o usuário `u` pode acessar, como JSON, para entrar na consulta da sessão: o proprietário vê todas as lojas
 * da conta; os demais, só as que foram liberadas a eles (user_stores). Fica aqui, em um só lugar, para a sessão e os testes. */
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

/* O proprietário não pode ser desativado nem rebaixado: a conta ficaria sem quem a administre. */
export function ownerProtectionError(target: { isAccountOwner: boolean }, next: { role: string; active: boolean }) {
  if (target.isAccountOwner && (next.role !== "ADMIN" || !next.active)) return "O proprietário da conta não pode ser desativado nem rebaixado.";
  return null;
}
