import { errorResponse } from "@/lib/errors";
import { requireApiUser } from "@/modules/auth/session";
import { guideApplies, loadGuideProgress } from "@/modules/onboarding/progress";

export const dynamic = "force-dynamic";

/* Andamento dos primeiros passos na loja da visão atual, para o acesso guiado saber o que apontar. Só leitura. */
export async function GET() {
  try {
    const user = await requireApiUser();
    const headers = { "Cache-Control": "private, no-store" };
    if (!guideApplies(user)) return Response.json({ active: false }, { headers });
    const progress = await loadGuideProgress(user);
    return Response.json({
      active: true,
      complete: progress.complete,
      stepId: progress.current?.id ?? null,
      number: progress.current ? progress.steps.findIndex((step) => step.id === progress.current!.id) + 1 : progress.total,
      total: progress.total,
      done: progress.steps.filter((step) => step.done).map((step) => step.id),
      consolidated: user.consolidated,
    }, { headers });
  } catch (error) { return errorResponse(error); }
}
