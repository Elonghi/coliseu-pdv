import { pool } from "@/db";

export type StoreStock = { name: string; quantity: number };

/** Saldo de cada loja (na ordem de `stores`) para os produtos informados. Loja sem linha em product_stock conta 0.
 * O banco já limita às lojas que a requisição enxerga. */
export async function stockByStore(productIds: string[], stores: { id: string; name: string }[]) {
  const result = new Map<string, StoreStock[]>();
  if (!productIds.length) return result;
  const rows = await pool.query<{ product_id: string; store_id: string; quantity: number }>(
    "SELECT product_id,store_id,quantity::int FROM product_stock WHERE product_id=ANY($1::uuid[]) AND store_id=ANY(app_store_ids())", [productIds]);
  const quantity = new Map(rows.rows.map((row) => [`${row.product_id}:${row.store_id}`, row.quantity]));
  for (const id of productIds) result.set(id, stores.map((store) => ({ name: store.name, quantity: quantity.get(`${id}:${store.id}`) ?? 0 })));
  return result;
}
