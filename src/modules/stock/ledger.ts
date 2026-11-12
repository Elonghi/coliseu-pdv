import type { PoolClient } from "pg";
import { requireActiveStore } from "@/modules/stores/context";

export { enterStore, requireActiveStore } from "@/modules/stores/context";

type Queryable = Pick<PoolClient, "query">;
export type StockLevel = { quantity: number; costCents: number };

/* Estoque por loja. O produto (catálogo) pode ser compartilhado entre as lojas do lojista; o saldo e o custo médio ficam em
 * product_stock, uma linha por loja e produto. Toda gravação de saldo passa por aqui, e vai para a loja ativa da requisição
 * (ou para a loja da operação, quando ela já pertence a uma, como uma venda ou uma nota fiscal: ver enterStore). */

/** Saldo do produto nas lojas que a requisição enxerga: a loja ativa, ou a soma das lojas do usuário na visão consolidada. */
export const stockQuantitySql = (alias = "p") =>
  `COALESCE((SELECT sum(ps.quantity) FROM product_stock ps WHERE ps.product_id=${alias}.id AND ps.store_id=ANY(app_store_ids())),0)::int`;

/** Custo médio nas lojas que a requisição enxerga (ponderado pelo saldo); sem saldo, o custo de referência do catálogo. */
export const stockCostSql = (alias = "p") =>
  `COALESCE((SELECT round(sum(ps.cost_cents::numeric*ps.quantity)/NULLIF(sum(ps.quantity),0)) FROM product_stock ps WHERE ps.product_id=${alias}.id AND ps.store_id=ANY(app_store_ids())),${alias}.cost_cents)::int`;

/** O produto é da loja ativa ou compartilhado. Sob RLS o banco já filtra; isto garante o mesmo quando a conexão não tem RLS
 * (em operações de uma loja só: venda, nota fiscal, abertura de box), para nunca casar com o produto de outra loja. */
export const productOfActiveStoreSql = (alias = "p") => `(${alias}.store_id IS NULL OR ${alias}.store_id=app_current_store())`;

/** Trava as linhas dos produtos, em ordem para não travar em ciclo. Tem de ser uma instrução à parte, ANTES de ler o saldo:
 * o saldo está em product_stock, que a trava da linha do produto não cobre. Lido na mesma instrução, em READ COMMITTED,
 * ele viria da fotografia antiga e duas vendas do último item passariam as duas. */
export async function lockProducts(client: Queryable, productIds: string[]) {
  await client.query("SELECT id FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[...new Set(productIds)].sort()]);
}

/** Trava os produtos e devolve o saldo e o custo médio da loja ativa. */
export async function lockStock(client: Queryable, productIds: string[]): Promise<Map<string, StockLevel>> {
  await requireActiveStore(client);
  await lockProducts(client, productIds);
  const rows = await client.query<{ id: string; quantity: number; cost_cents: number }>(
    `SELECT p.id,COALESCE(ps.quantity,0)::int AS quantity,COALESCE(ps.cost_cents,p.cost_cents)::int AS cost_cents
     FROM products p LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.store_id=app_current_store()
     WHERE p.id=ANY($1::uuid[])`, [[...new Set(productIds)]]);
  return new Map(rows.rows.map((row) => [row.id, { quantity: row.quantity, costCents: row.cost_cents }]));
}

/** Grava o saldo (e, se informado, o custo médio) do produto na loja ativa. O custo de referência do catálogo acompanha o último custo. */
export async function setStock(client: Queryable, productId: string, quantity: number, costCents?: number) {
  await client.query(
    `INSERT INTO product_stock (product_id,quantity,cost_cents) VALUES ($1,$2,COALESCE($3::int,(SELECT cost_cents FROM products WHERE id=$1)))
     ON CONFLICT (store_id,product_id) DO UPDATE SET quantity=EXCLUDED.quantity,cost_cents=COALESCE($3::int,product_stock.cost_cents),updated_at=now()`,
    [productId, quantity, costCents ?? null]);
  if (costCents !== undefined) await client.query("UPDATE products SET cost_cents=$1,updated_at=now() WHERE id=$2", [costCents, productId]);
}
