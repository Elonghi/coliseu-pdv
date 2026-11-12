"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Check, Compass } from "lucide-react";
import { dismissGuideAction, markGuideWelcomedAction } from "@/modules/onboarding/actions";
import { guideSteps, type GuideStepId } from "@/modules/onboarding/steps";
import { indications, type Indication } from "./indications";

type Progress = { active: boolean; complete: boolean; stepId: GuideStepId | null; number: number; total: number; done: GuideStepId[]; consolidated: boolean };
/** checking: primeira vez, ainda vendo se há passos pendentes (só então aparecem as boas-vindas). */
type Phase = "checking" | "welcome" | "running" | "celebrating" | "stopped";
type Box = { top: number; left: number; width: number; height: number };
type Side = "top" | "bottom" | "left" | "right";

const WIDTH = 300;
const GAP = 14;
const EDGE = 12;
const completeKey = (scope: string) => `coliseu:guide-complete:${scope}`;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** Escolhe o lado do balão que cabe na tela sem cobrir o elemento apontado. */
function place(box: Box, size: { w: number; h: number }, preferred: Side) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const spots: Record<Side, { top: number; left: number; fits: boolean }> = {
    right: { left: box.left + box.width + GAP, top: box.top + box.height / 2 - size.h / 2, fits: box.left + box.width + GAP + size.w <= vw - EDGE },
    left: { left: box.left - GAP - size.w, top: box.top + box.height / 2 - size.h / 2, fits: box.left - GAP - size.w >= EDGE },
    bottom: { left: box.left + box.width / 2 - size.w / 2, top: box.top + box.height + GAP, fits: box.top + box.height + GAP + size.h <= vh - EDGE },
    top: { left: box.left + box.width / 2 - size.w / 2, top: box.top - GAP - size.h, fits: box.top - GAP - size.h >= EDGE },
  };
  const side = ([preferred, opposite[preferred], "bottom", "right", "top", "left"] as Side[]).find((candidate) => spots[candidate].fits) ?? "bottom";
  const left = clamp(spots[side].left, EDGE, vw - size.w - EDGE);
  const top = clamp(spots[side].top, EDGE, vh - size.h - EDGE);
  const arrow = side === "top" || side === "bottom" ? clamp(box.left + box.width / 2 - left, 18, size.w - 18) : clamp(box.top + box.height / 2 - top, 18, size.h - 18);
  return { side, top, left, arrow };
}

function Bubble({ indication, progress, onExit, style, side, docked, ref }: { indication: Indication; progress: Progress; onExit: () => void; style?: React.CSSProperties; side?: Side | "sheet"; docked?: boolean; ref?: React.Ref<HTMLElement> }) {
  return <aside ref={ref} className={`guide-bubble ${docked ? "is-docked" : ""}`} data-side={side} style={style} role="status" aria-live="polite">
    <p className="guide-bubble-step"><Compass size={13}/>Passo {progress.number} de {progress.total}</p>
    <h3>{indication.title}</h3>
    <p className="guide-bubble-text">{indication.text}</p>
    <div className="guide-bubble-foot">
      <span className="guide-dots" aria-hidden>{guideSteps.map((step) => <i key={step.id} className={progress.done.includes(step.id) ? "is-done" : step.id === progress.stepId ? "is-current" : ""}/>)}</span>
      <button type="button" className="guide-bubble-exit" onClick={onExit}>Sair do guia</button>
    </div>
  </aside>;
}

/* Acesso guiado: depois das boas-vindas, aponta na tela real o que clicar ou digitar para chegar à primeira venda. O que apontar vem
 * do andamento dos dados (/api/guide) e do que está aberto na tela (indications.ts), então acompanha a pessoa sem guardar etapa. */
export function GuidedTour({ firstVisit, scopeKey, firstName }: { firstVisit: boolean; scopeKey: string; firstName: string }) {
  const pathname = usePathname();
  // O guia atua no painel da loja e no PDV; o painel do sistema (/plataforma) e as demais telas ficam como estão.
  const inScope = pathname.startsWith("/admin") || pathname.startsWith("/pdv");
  const [phase, setPhase] = useState<Phase>(firstVisit ? "checking" : "running");
  const first = useRef(firstVisit);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [current, setCurrent] = useState<Indication | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({ w: WIDTH, h: 150 });
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const touched = useRef(new Set<string>());
  const sawIncomplete = useRef(false);
  const bubble = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/guide", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as Progress;
      if (!data.active) { setPhase("stopped"); return; }
      if (data.complete) {
        window.sessionStorage.setItem(completeKey(scopeKey), "1");
        // Já estava pronto na primeira visita: não há o que guiar, e isso fica lembrado para não checar de novo.
        if (first.current && !sawIncomplete.current) void dismissGuideAction();
        first.current = false;
        // Terminou agora, durante este uso: comemora. Já estava pronto ao entrar: não mostra nada.
        setPhase(sawIncomplete.current ? "celebrating" : "stopped");
      } else {
        sawIncomplete.current = true;
        // Primeira visita com passos pendentes: agora sim, as boas-vindas.
        setPhase((previous) => previous === "checking" ? "welcome" : previous);
      }
      setProgress(data);
    } catch { /* sem rede, o guia só espera a próxima oportunidade */ }
  }, [scopeKey]);

  // Andamento: ao entrar, a cada tela nova e logo depois de cliques e envios (os dados mudam com a ação da pessoa).
  useEffect(() => {
    if ((phase !== "running" && phase !== "checking") || !inScope) return;
    touched.current = new Set();
    try { if (window.sessionStorage.getItem(completeKey(scopeKey)) === "1") return; } catch { /* sem sessionStorage, consulta mesmo */ }
    queueMicrotask(() => void refresh());
  }, [phase, inScope, pathname, scopeKey, refresh]);

  useEffect(() => {
    if (phase !== "running" || !inScope) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const later = () => { timers.forEach(clearTimeout); timers = [700, 1800, 3800].map((delay) => setTimeout(() => void refresh(), delay)); };
    document.addEventListener("submit", later, true);
    document.addEventListener("click", later, true);
    return () => { document.removeEventListener("submit", later, true); document.removeEventListener("click", later, true); timers.forEach(clearTimeout); };
  }, [phase, inScope, refresh]);

  // O que apontar agora: reavalia quando o andamento, a tela ou o que está aberto/preenchido muda.
  useEffect(() => {
    if (phase !== "running" || !inScope || !progress?.active || progress.complete || !progress.stepId) { queueMicrotask(() => setCurrent(null)); return; }
    const stepId = progress.stepId;
    let frame = 0;
    const evaluate = () => {
      const context = { path: pathname, consolidated: progress.consolidated, touched: touched.current };
      let found: Indication | null = null;
      for (const find of indications[stepId]) { found = find(context); if (found) break; }
      setCurrent((previous) => previous && found && previous.el === found.el && previous.id === found.id && previous.text === found.text ? previous : found);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(evaluate); };
    const leave = (event: Event) => { const name = (event.target as HTMLInputElement | null)?.name; if (name) touched.current.add(name); schedule(); };
    const events = ["input", "change", "click", "focusin"] as const;
    for (const name of events) document.addEventListener(name, schedule, true);
    document.addEventListener("focusout", leave, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "hidden", "disabled", "class"] });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      for (const name of events) document.removeEventListener(name, schedule, true);
      document.removeEventListener("focusout", leave, true);
      observer.disconnect();
    };
  }, [phase, inScope, progress, pathname]);

  // Destaque no elemento real e rolagem até ele, uma vez por indicação.
  useEffect(() => {
    const el = current?.el;
    if (!el) return;
    el.classList.add("guide-target");
    const rect = el.getBoundingClientRect();
    if (rect.top < 64 || rect.bottom > window.innerHeight - 64) el.scrollIntoView({ block: "center", behavior: "smooth" });
    return () => el.classList.remove("guide-target");
  }, [current?.id, current?.el]);

  // Posição do elemento (acompanha rolagem, animação e redimensionamento).
  useEffect(() => {
    const el = current?.el;
    if (!el) { queueMicrotask(() => setBox(null)); return; }
    let frame = 0;
    const track = () => {
      const r = el.getBoundingClientRect();
      setBox((previous) => previous && Math.abs(previous.top - r.top) < 0.5 && Math.abs(previous.left - r.left) < 0.5 && Math.abs(previous.width - r.width) < 0.5 && Math.abs(previous.height - r.height) < 0.5 ? previous : { top: r.top, left: r.left, width: r.width, height: r.height });
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [current?.el]);

  // Dentro de um modal (<dialog>), o resto da página fica inerte: o balão vai encaixado no próprio modal.
  useEffect(() => {
    const dialog = current?.el.closest("dialog");
    if (!dialog) { queueMicrotask(() => setDock(null)); return; }
    let host = dialog.querySelector<HTMLElement>(".guide-dock");
    if (!host) { host = document.createElement("div"); host.className = "guide-dock"; const body = dialog.querySelector(".dialog-body"); if (body) dialog.insertBefore(host, body); else dialog.prepend(host); }
    const target = host;
    queueMicrotask(() => setDock(target));
  }, [current?.el]);

  const hasBox = Boolean(box);
  useLayoutEffect(() => {
    const el = bubble.current;
    if (el) setSize((previous) => previous.h === el.offsetHeight && previous.w === el.offsetWidth ? previous : { w: el.offsetWidth, h: el.offsetHeight });
  }, [current?.id, current?.text, hasBox]);

  useEffect(() => {
    document.documentElement.dataset.guide = phase;
    return () => { delete document.documentElement.dataset.guide; };
  }, [phase]);

  const exit = useCallback(() => { setPhase("stopped"); void dismissGuideAction(); }, []);
  const start = () => { setPhase("running"); void markGuideWelcomedAction(); };
  // Ao concluir a comemoração o guia se despede para sempre (o cookie faz o painel deixar de montá-lo).
  const finish = () => { setPhase("stopped"); void dismissGuideAction(); };

  if (phase === "welcome") return !inScope ? null : <div className="guide-welcome" role="dialog" aria-modal="true" aria-labelledby="guide-welcome-title">
    <section className="guide-welcome-card">
      <span className="guide-welcome-mark"><Compass size={22}/></span>
      <h2 id="guide-welcome-title">Bem-vindo, {firstName}!</h2>
      <p>Vou te guiar pelo básico para a sua loja começar a vender. Eu aponto onde clicar e o que digitar, em seis passos:</p>
      <ol>{guideSteps.map((step) => <li key={step.id}>{step.title}</li>)}</ol>
      <p className="guide-welcome-note">Leva uns cinco minutos. Você pode sair quando quiser e retomar depois pelo painel.</p>
      <div className="guide-welcome-actions">
        <button type="button" className="btn btn-primary" autoFocus onClick={start}>Começar o acesso guiado</button>
        <button type="button" className="btn btn-ghost" onClick={exit}>Agora não</button>
      </div>
    </section>
  </div>;

  if (phase === "celebrating") return <div className="guide-welcome" role="dialog" aria-modal="true" aria-labelledby="guide-done-title">
    <section className="guide-welcome-card">
      <span className="guide-welcome-mark is-done"><Check size={22}/></span>
      <h2 id="guide-done-title">Tudo pronto, {firstName}!</h2>
      <p>Sua loja já cadastra produtos, controla estoque, abre caixa e vende. Daqui para a frente você usa o sistema sozinho, e o guia não aparece mais.</p>
      <p className="guide-welcome-note">Quando quiser ir além, veja equipe, notas fiscais e etiquetas em Primeiros passos, no menu.</p>
      <div className="guide-welcome-actions"><button type="button" className="btn btn-primary" autoFocus onClick={finish}>Concluir</button></div>
    </section>
  </div>;

  if (phase !== "running" || !inScope || !current || !progress || !box) return null;
  if (dock) return createPortal(<Bubble indication={current} progress={progress} onExit={exit} docked/>, dock);

  const sheet = window.innerWidth < 720;
  const spot = { top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 };
  const spotNode = <div className="guide-spot" style={spot}/>;
  if (sheet) return createPortal(<>{spotNode}<Bubble indication={current} progress={progress} onExit={exit} side="sheet" style={{ left: EDGE, right: EDGE, bottom: EDGE }}/></>, document.body);
  const spotPlace = place(box, size, current.placement ?? "bottom");
  const style = { top: spotPlace.top, left: spotPlace.left, width: WIDTH, "--arrow": `${spotPlace.arrow}px` } as React.CSSProperties;
  return createPortal(<>{spotNode}<Bubble ref={bubble} indication={current} progress={progress} onExit={exit} side={spotPlace.side} style={style}/></>, document.body);
}
