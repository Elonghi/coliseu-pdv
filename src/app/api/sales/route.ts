import { errorResponse } from "@/lib/errors";
import { requireSameOrigin } from "@/lib/security";
import { requireApiUser } from "@/modules/auth/session";
import { createSale } from "@/modules/sales/service";

export async function POST(request: Request) {
  try { requireSameOrigin(request); const user = await requireApiUser(); const sale = await createSale(await request.json(), user.id); return Response.json(sale, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
