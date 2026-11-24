import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { authenticateAgent, finishJob } from "@/modules/printing/service";
import { bearerToken } from "@/modules/printing/token";

const resultSchema = z.object({ ok: z.boolean(), error: z.string().max(2000).optional() });

/** Resposta do agente: o trabalho foi impresso ou falhou (com a mensagem do sistema operacional). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const agent = await authenticateAgent(bearerToken(request));
    if (!agent) return Response.json({ error: "Token do agente inválido ou impressora desativada.", code: "AGENT_UNAUTHORIZED" }, { status: 401 });
    const id = z.uuid().parse((await context.params).id);
    const body = resultSchema.parse(await request.json());
    if (!await finishJob(agent, id, body.ok, body.error)) return Response.json({ error: "Trabalho não encontrado ou já respondido.", code: "PRINT_JOB_NOT_FOUND" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
