import { pool } from "@/db";
import { errorResponse } from "@/lib/errors";
import { requireApiUser } from "@/modules/auth/session";

export async function GET(request: Request) {
  try {
    await requireApiUser();
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return Response.json([]);
    const result = await pool.query(`SELECT id,name,email,phone,credit_balance_cents AS "creditBalanceCents"
      FROM players WHERE active=true AND (name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)
      ORDER BY CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,name LIMIT 20`, [`%${query}%`, `${query}%`]);
    return Response.json(result.rows);
  } catch (error) { return errorResponse(error); }
}
