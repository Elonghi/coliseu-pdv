import { pool } from "@/db";
import { AppError } from "@/lib/errors";

export async function adjustStock(productId: string, delta: number, type: "MANUAL_IN" | "MANUAL_ADJUSTMENT" | "RETURN", notes: string, userId: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new AppError("Informe uma quantidade diferente de zero.", 422);
  if (type !== "MANUAL_ADJUSTMENT" && delta < 0) throw new AppError("Este tipo só aceita entradas.", 422);
  if (notes.trim().length < 5) throw new AppError("Informe um motivo com pelo menos 5 caracteres.", 422);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ stock_quantity: number }>("SELECT stock_quantity FROM products WHERE id=$1 FOR UPDATE", [productId]);
    if (!result.rows[0]) throw new AppError("Produto não encontrado.", 404);
    const previous = result.rows[0].stock_quantity;
    const next = previous + delta;
    if (next < 0) throw new AppError("O ajuste deixaria o estoque negativo.", 409, "NEGATIVE_STOCK");
    await client.query("UPDATE products SET stock_quantity=$1,updated_at=now() WHERE id=$2", [next, productId]);
    await client.query("INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,user_id,notes) VALUES ($1,$2,$3,$4,$5,$6,$7)", [productId, type, delta, previous, next, userId, notes.trim()]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'STOCK_ADJUST','product',$2,$3)", [userId, productId, JSON.stringify({ delta, type, notes })]);
    await client.query("COMMIT"); return { previous, next };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
