import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { requireSameOrigin } from "@/lib/security";
import { requireApiUser } from "@/modules/auth/session";
import { enqueueSaleReceipt } from "@/modules/printing/service";

const bodySchema = z.object({ terminalId: z.uuid({ message: "Escolha a impressora deste caixa." }) });

/** Põe o comprovante da venda na fila da impressora escolhida no caixa. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requireApiUser();
    const saleId = z.coerce.number().int().positive().parse((await context.params).id);
    const { terminalId } = bodySchema.parse(await request.json());
    const jobId = await enqueueSaleReceipt(saleId, terminalId, user);
    return Response.json({ jobId }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
