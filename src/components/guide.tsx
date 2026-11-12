import Link from "next/link";
import { ArrowRight, Check, Compass, Store } from "lucide-react";
import type { SessionUser } from "@/modules/auth/session";
import { dismissGuideAction } from "@/modules/onboarding/actions";
import { guideApplies, loadGuideProgress, type GuideProgress, type GuideStepId } from "@/modules/onboarding/progress";
import { readGuideCookie } from "@/modules/onboarding/state";

export function GuideBar({ done, total }: { done: number; total: number }) {
  return <div className="guide-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} de ${total} passos concluídos`}>
    <span style={{ width: `${(done / total) * 100}%` }}/>
  </div>;
}

const STORE_HINT = "Escolha uma loja no seletor do menu: este passo é de cada loja.";

/* Aviso no topo das telas do caminho mínimo: em que passo a pessoa está, o que fazer ali e, concluído, o próximo. Some quando o guia
 * é dispensado ou termina, e nunca aparece para quem não configura o sistema (operador). */
export async function GuideCoach({ user, steps }: { user: SessionUser; steps: GuideStepId[] }) {
  if (!guideApplies(user) || (await readGuideCookie(user.id)) === "dismissed") return null;
  const progress = await loadGuideProgress(user);
  if (progress.complete) return null;
  const here = progress.steps.filter((step) => steps.includes(step.id));
  const target = here.find((step) => !step.done) ?? here[here.length - 1];
  if (!target) return null;
  const number = progress.steps.findIndex((step) => step.id === target.id) + 1;
  const next = target.done ? progress.current : null;
  return <aside className="guide-coach" aria-label="Guia de primeiros passos">
    <span className="guide-coach-mark" aria-hidden><Compass size={18}/></span>
    <div className="guide-coach-body">
      <p className="guide-coach-title"><b>Passo {number} de {progress.total}</b> · {target.title}{target.done && <span className="guide-coach-done"><Check size={13}/>Concluído</span>}</p>
      {target.done
        ? <p>{next ? <>Próximo: <b>{next.title}</b>. {next.summary}</> : "Falta só terminar os passos que ficaram para trás."}</p>
        : <>
          {target.storeBound && user.consolidated && <p className="guide-coach-store"><Store size={13}/>{STORE_HINT}</p>}
          <ol className="guide-coach-tips">{target.tips.slice(0, 3).map((tip) => <li key={tip}>{tip}</li>)}</ol>
        </>}
    </div>
    <div className="guide-coach-actions">
      {next && <Link className="btn btn-primary btn-sm" href={next.href}>{next.title}<ArrowRight size={14}/></Link>}
      <Link className="btn btn-ghost btn-sm" href="/admin/primeiros-passos">Ver todos os passos</Link>
    </div>
  </aside>;
}

/* Cartão do dashboard enquanto faltam passos: o próximo passo em destaque e a opção de dispensar. */
export function GuideCard({ progress, user }: { progress: GuideProgress; user: SessionUser }) {
  const next = progress.current;
  if (!next) return null;
  return <section className="card guide-card" aria-label="Primeiros passos">
    <div className="guide-card-head">
      <div>
        <p className="page-eyebrow">Comece por aqui</p>
        <h2 className="panel-title">Primeiros passos</h2>
      </div>
      <div className="guide-card-count"><b>{progress.doneCount}</b> de {progress.total}</div>
    </div>
    <GuideBar done={progress.doneCount} total={progress.total}/>
    <div className="guide-card-next">
      <div>
        <p className="guide-card-step">Passo {progress.doneCount + 1}: {next.title}</p>
        <p>{next.summary}</p>
        {next.storeBound && user.consolidated && <p className="guide-coach-store"><Store size={13}/>{STORE_HINT}</p>}
      </div>
      <div className="guide-card-actions">
        <Link className="btn btn-primary" href={next.href}>{next.action}<ArrowRight size={16}/></Link>
        <Link className="btn btn-ghost" href="/admin/primeiros-passos">Ver todos os passos</Link>
      </div>
    </div>
    <form action={dismissGuideAction} className="guide-card-dismiss"><button type="submit" className="link-row">Dispensar este guia</button></form>
  </section>;
}
