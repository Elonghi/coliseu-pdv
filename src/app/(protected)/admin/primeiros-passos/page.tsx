import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, PartyPopper, Store } from "lucide-react";
import { GuideBar } from "@/components/guide";
import { GuideWelcomeMark } from "@/components/guide-welcome-mark";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser } from "@/modules/auth/session";
import { dismissGuideAction, resumeGuideAction } from "@/modules/onboarding/actions";
import { guideApplies, loadGuideProgress } from "@/modules/onboarding/progress";
import { readGuideCookie } from "@/modules/onboarding/state";

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const user = await requireUser();
  if (!guideApplies(user)) redirect("/admin");
  const [progress, remembered] = await Promise.all([loadGuideProgress(user), readGuideCookie(user.id)]);
  const storeName = user.stores.find((store) => store.id === user.activeStoreId)?.name;

  return <div className="section-gap">
    <GuideWelcomeMark/>
    <PageHeader
      eyebrow="Começando"
      title="Primeiros passos"
      description="Do zero até a primeira venda em seis passos. Cada um abre a tela certa, e a marcação é automática quando você conclui."
    />

    {user.stores.length > 1 && <p className="stock-scope" role="status"><Store size={14}/>{user.consolidated
      ? <span>Você está na visão de <b>todas as lojas</b>. Produto, estoque e caixa são de cada loja: escolha uma no seletor do menu para fazer esses passos.</span>
      : <span>Passos conferidos na loja <b>{storeName}</b>. Troque a loja no seletor do menu para configurar outra.</span>}</p>}

    <section className="card guide-card" aria-label="Andamento">
      <div className="guide-card-head">
        <div><h2 className="panel-title">{progress.complete ? "Tudo pronto para vender" : "Seu andamento"}</h2></div>
        <div className="guide-card-count"><b>{progress.doneCount}</b> de {progress.total}</div>
      </div>
      <GuideBar done={progress.doneCount} total={progress.total}/>
      {progress.complete && <p className="guide-done-note"><PartyPopper size={16}/>Os seis passos estão feitos: a loja já cadastra, controla estoque, abre caixa e vende. Os próximos itens são opcionais.</p>}
    </section>

    <ol className="guide-steps">
      {progress.steps.map((step, index) => {
        const current = progress.current?.id === step.id;
        return <li key={step.id} className={`guide-step ${step.done ? "is-done" : ""} ${current ? "is-current" : ""}`}>
          <span className="guide-step-mark" aria-hidden>{step.done ? <Check size={16}/> : index + 1}</span>
          <div className="guide-step-body">
            <div className="guide-step-head">
              <h3>{step.title}</h3>
              {step.done ? <Badge tone="ok" dot>Feito</Badge> : current ? <Badge tone="info" dot>Agora</Badge> : null}
            </div>
            <p>{step.summary}</p>
            <details open={current}>
              <summary>Como fazer</summary>
              <ol className="guide-tips">{step.tips.map((tip) => <li key={tip}>{tip}</li>)}</ol>
            </details>
            {!step.done && (step.storeBound && user.consolidated
              ? <p className="guide-coach-store"><Store size={13}/>Escolha uma loja no seletor do menu para fazer este passo.</p>
              : <Link className={`btn btn-sm ${current ? "btn-primary" : "btn-ghost"}`} href={step.href}>{step.action}<ArrowRight size={14}/></Link>)}
          </div>
        </li>;
      })}
    </ol>

    <section className="card" aria-label="Depois do básico">
      <div className="panel-head"><div><h2 className="panel-title">Depois do básico</h2><p className="panel-desc">Opcional, na ordem que fizer sentido para a sua operação.</p></div></div>
      <ul className="guide-extras">
        {progress.extras.map((extra) => <li key={extra.href}>
          <div><b>{extra.title}</b><p>{extra.text}</p></div>
          {extra.done ? <Badge tone="ok" dot>Feito</Badge> : <Link className="btn btn-ghost btn-sm" href={extra.href}>Abrir<ArrowRight size={14}/></Link>}
        </li>)}
      </ul>
    </section>

    <form action={remembered === "dismissed" ? resumeGuideAction : dismissGuideAction} className="guide-card-dismiss">
      <button type="submit" className="link-row">{remembered === "dismissed" ? "Mostrar o guia no painel de novo" : "Dispensar o guia do painel"}</button>
    </form>
  </div>;
}
