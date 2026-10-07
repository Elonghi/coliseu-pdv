import { errorResponse } from "@/lib/errors";
import { requireSameOrigin } from "@/lib/security";
import { requireApiUser } from "@/modules/auth/session";
import { cancelSaleSchema } from "@/modules/sales/schemas";
import { cancelSale } from "@/modules/sales/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const user = await requireApiUser("ADMIN"); const { id } = await context.params; const body = cancelSaleSchema.parse(await request.json()); await cancelSale(Number(id), body.reason, user.id); return Response.json({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
