import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { resumeGuideAction } from "@/modules/onboarding/actions";
import type { GuideProgress } from "@/modules/onboarding/progress";

export function GuideBar({ done, total }: { done: number; total: number }) {
  return <div className="guide-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} de ${total} passos concluídos`}>
    <span style={{ width: `${(done / total) * 100}%` }}/>
  </div>;
}

/* Cartão do dashboard para quem pausou o acesso guiado e ainda tem passos: mostra onde parou e retoma de onde estava. */
export function GuideResumeCard({ progress }: { progress: GuideProgress }) {
  const next = progress.current;
  if (!next) return null;
  return <section className="card guide-card" aria-label="Acesso guiado pausado">
    <div className="guide-card-head">
      <div>
        <p className="page-eyebrow">Acesso guiado pausado</p>
        <h2 className="panel-title">Faltam {progress.total - progress.doneCount} passos para a primeira venda</h2>
      </div>
      <div className="guide-card-count"><b>{progress.doneCount}</b> de {progress.total}</div>
    </div>
    <GuideBar done={progress.doneCount} total={progress.total}/>
    <div className="guide-card-next">
      <div>
        <p className="guide-card-step">Próximo: {next.title}</p>
        <p>{next.summary}</p>
      </div>
      <div className="guide-card-actions">
        <form action={resumeGuideAction}><button type="submit" className="btn btn-primary"><Compass size={16}/>Retomar acesso guiado</button></form>
        <Link className="btn btn-ghost" href="/admin/primeiros-passos">Ver todos os passos<ArrowRight size={14}/></Link>
      </div>
    </div>
  </section>;
}
