import { enterComanda, handlePublic, readJsonBody } from "@/modules/comandas/public";

export const dynamic = "force-dynamic";

/* O cliente abriu o link do QR e permitiu a localização: confere a comanda, vincula o aparelho e devolve o cardápio e a conta. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handlePublic(request, token, async (comanda, headers) => enterComanda(comanda, headers, await readJsonBody(request)));
}
