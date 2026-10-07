import { pool } from "@/db";
import { AppError } from "@/lib/errors";

export type ProductInput = { sku: string; barcode?: string | null; name: string; description?: string | null; categoryId: string; unitId: string; costCents: number; salePriceCents: number; maxDiscountBps: number; minimumStock: number; active?: boolean };

function validateProduct(input: ProductInput) {
  if (!input.sku.trim() || !input.name.trim()) throw new AppError("SKU e nome são obrigatórios.", 422);
  for (const value of [input.costCents, input.salePriceCents, input.maxDiscountBps, input.minimumStock]) if (!Number.isInteger(value) || value < 0) throw new AppError("Valores do produto são inválidos.", 422);
  if (input.maxDiscountBps > 10_000) throw new AppError("Desconto máximo inválido.", 422);
}

export async function createProduct(input: ProductInput, initialStock: number, userId: string, imageKey?: string | null) {
  validateProduct(input);
  if (!Number.isInteger(initialStock) || initialStock < 0) throw new AppError("Estoque inicial inválido.", 422);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(`INSERT INTO products (sku,barcode,name,description,image_key,category_id,unit_id,cost_cents,sale_price_cents,max_discount_bps,stock_quantity,minimum_stock,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [input.sku.trim().toUpperCase(), input.barcode?.trim() || null, input.name.trim(), input.description?.trim() || null, imageKey ?? null, input.categoryId, input.unitId, input.costCents, input.salePriceCents, input.maxDiscountBps, initialStock, input.minimumStock, input.active ?? true]);
    const id = result.rows[0].id;
    if (initialStock > 0) await client.query("INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,user_id,notes) VALUES ($1,'INITIAL',$2,0,$2,$3,'Estoque inicial')", [id, initialStock, userId]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'PRODUCT_CREATE','product',$2,$3)", [userId, id, JSON.stringify(input)]);
    await client.query("COMMIT"); return id;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    if (typeof error === "object" && error && "code" in error && error.code === "23505") throw new AppError("SKU ou código de barras já cadastrado.", 409, "DUPLICATE");
    throw error;
  } finally { client.release(); }
}

export async function updateProduct(id: string, input: ProductInput, userId: string, imageKey?: string | null) {
  validateProduct(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [id]);
    if (!before.rows[0]) throw new AppError("Produto não encontrado.", 404);
    await client.query(`UPDATE products SET sku=$1,barcode=$2,name=$3,description=$4,category_id=$5,unit_id=$6,cost_cents=$7,sale_price_cents=$8,max_discount_bps=$9,minimum_stock=$10,active=$11,image_key=COALESCE($12,image_key),updated_at=now() WHERE id=$13`, [input.sku.trim().toUpperCase(), input.barcode?.trim() || null, input.name.trim(), input.description?.trim() || null, input.categoryId, input.unitId, input.costCents, input.salePriceCents, input.maxDiscountBps, input.minimumStock, input.active ?? true, imageKey ?? null, id]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,before,after) VALUES ($1,'PRODUCT_UPDATE','product',$2,$3,$4)", [userId, id, JSON.stringify(before.rows[0]), JSON.stringify(input)]);
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    if (typeof error === "object" && error && "code" in error && error.code === "23505") throw new AppError("SKU ou código de barras já cadastrado.", 409);
    throw error;
  } finally { client.release(); }
}
