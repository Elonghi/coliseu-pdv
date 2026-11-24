import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { requireApiUser } from "@/modules/auth/session";
import { getJobStatus } from "@/modules/printing/service";

/** Situação de uma impressão pedida pelo caixa (o PDV consulta até o agente responder). */
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const id = z.uuid().parse((await context.params).id);
    return Response.json(await getJobStatus(id, user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
