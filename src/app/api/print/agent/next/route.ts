import { errorResponse } from "@/lib/errors";
import { agentHeartbeat, authenticateAgent, claimNextJob } from "@/modules/printing/service";
import { bearerToken } from "@/modules/printing/token";

/* Busca do agente de impressão (long-poll): devolve o próximo trabalho assim que houver, ou 204 depois de `wait`
 * segundos sem nada. O agente abre a conexão de saída, então o navegador do caixa não precisa falar com o localhost. */
const MAX_WAIT_SECONDS = 25;
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(bearerToken(request));
    if (!agent) return Response.json({ error: "Token do agente inválido ou impressora desativada.", code: "AGENT_UNAUTHORIZED" }, { status: 401 });
    const wait = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(new URL(request.url).searchParams.get("wait")) || 0));
    await agentHeartbeat(agent, request.headers.get("x-agent-info"));
    const deadline = Date.now() + wait * 1000;
    while (!request.signal.aborted) {
      const job = await claimNextJob(agent);
      if (job) return Response.json({ id: job.id, kind: job.kind, data: job.payload.toString("base64") }, { headers: { "Cache-Control": "no-store" } });
      if (Date.now() >= deadline) break;
      await sleep(1000, request.signal);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
