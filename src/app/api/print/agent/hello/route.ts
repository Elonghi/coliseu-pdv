import { errorResponse } from "@/lib/errors";
import { authenticateAgent, describeAgent } from "@/modules/printing/service";
import { bearerToken } from "@/modules/printing/token";

/* Conferência do token pelo instalador do agente (`--verificar`): diz de qual loja e impressora ele é, sem buscar
 * trabalho da fila nem marcar o agente como conectado. */
export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(bearerToken(request));
    if (!agent) return Response.json({ error: "Token do agente inválido ou impressora desativada.", code: "AGENT_UNAUTHORIZED" }, { status: 401 });
    return Response.json(await describeAgent(agent), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
