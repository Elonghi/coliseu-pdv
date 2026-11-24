import { createCustomerOrder, handlePublic, readJsonBody } from "@/modules/comandas/public";

export const dynamic = "force-dynamic";

/* Pedido do cliente: entra direto na conta da comanda aberta. Preço e estoque são conferidos no servidor. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handlePublic(request, token, async (comanda, headers) => createCustomerOrder(comanda, headers, await readJsonBody(request)));
}
