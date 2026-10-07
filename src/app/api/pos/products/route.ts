import { pool } from "@/db";
import { errorResponse } from "@/lib/errors";
import { requireApiUser } from "@/modules/auth/session";

export async function GET(request: Request) {
  try {
    await requireApiUser();
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (!q) return Response.json([]);
    const result = await pool.query(`SELECT p.id,p.sku,p.barcode,p.name,p.image_key AS "imageKey",p.sale_price_cents AS "salePriceCents",p.max_discount_bps AS "maxDiscountBps",p.stock_quantity AS "stockQuantity",u.code AS "unitCode" FROM products p JOIN units u ON u.id=p.unit_id WHERE p.active=true AND p.stock_quantity>0 AND (p.barcode=$1 OR p.sku ILIKE $2 OR p.name ILIKE $3) ORDER BY CASE WHEN p.barcode=$1 OR lower(p.sku)=lower($1) THEN 0 ELSE 1 END,p.name LIMIT 20`, [q, `${q}%`, `%${q}%`]);
    return Response.json(result.rows);
  } catch (error) { return errorResponse(error); }
}
