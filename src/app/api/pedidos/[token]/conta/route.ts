import { handlePublic, readCustomerAccount } from "@/modules/comandas/public";

export const dynamic = "force-dynamic";

/* Atualização periódica da conta no celular. Só responde ao aparelho que já entrou na comanda. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handlePublic(request, token, async (comanda) => readCustomerAccount(comanda));
}
