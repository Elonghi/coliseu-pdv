import { errorResponse } from "@/lib/errors";
import { permissions } from "@/modules/auth/permissions";
import { requireApiPermission } from "@/modules/auth/session";
import { listNewOrders } from "@/modules/comandas/service";

export const dynamic = "force-dynamic";

/* Pedidos de clientes ainda não vistos pelo balcão, para o aviso da tela de comandas. */
export async function GET() {
  try {
    await requireApiPermission(permissions.CASH_MANAGE);
    const orders = await listNewOrders(30);
    return Response.json({ orders: orders.map((order) => ({ id: order.id, number: order.number, player: order.player_name, items: order.items })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
