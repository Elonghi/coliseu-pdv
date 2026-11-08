import type { PoolClient } from "pg";
import { AppError } from "@/lib/errors";

type Queryable = Pick<PoolClient, "query">;

/* Contexto de loja de uma operação no banco: a loja ativa da requisição, ou a loja a que uma operação já pertence. */

export async function requireActiveStore(client: Queryable, action = "movimentar o estoque"): Promise<string> {
  const id = (await client.query<{ id: string | null }>("SELECT app_current_store() AS id")).rows[0].id;
  if (!id) throw new AppError(`Escolha uma loja específica no seletor de lojas para ${action}.`, 409, "STORE_REQUIRED");
  return id;
}

/** Faz o resto da transação valer para a loja de uma operação que já pertence a uma (venda, nota, inventário, pedido, duplicata).
 * Só vale para loja que a requisição enxerga, e só até o fim da transação: nada fica na conexão. Use depois do BEGIN. */
export async function enterStore(client: Queryable, storeId: string) {
  const visible = (await client.query<{ ok: boolean }>("SELECT $1::uuid = ANY(app_store_ids()) AS ok", [storeId])).rows[0].ok;
  if (!visible) throw new AppError("Esta operação pertence a uma loja que você não está vendo. Escolha a loja no seletor de lojas.", 409, "STORE_MISMATCH");
  await client.query("SELECT set_config('app.store_id',$1,true)", [storeId]);
}
