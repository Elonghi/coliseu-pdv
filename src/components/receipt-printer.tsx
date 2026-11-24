"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";

export type PrinterOption = { id: string; name: string; online: boolean };
type Choice = { terminalId: string; auto: boolean };
type Status = "idle" | "sending" | "QUEUED" | "SENT" | "PRINTED" | "FAILED" | "error";

const labels: Record<Status, string> = {
  idle: "",
  sending: "Enviando...",
  QUEUED: "Aguardando o agente...",
  SENT: "Imprimindo...",
  PRINTED: "Impresso",
  FAILED: "Falhou",
  error: "Não enviado",
};

/* A impressora de cada caixa é escolhida uma vez e fica neste navegador (cada computador tem a sua). */
const storageKey = (storeId: string) => `coliseu-printer:${storeId}`;
function readChoice(storeId: string, printers: PrinterOption[]): Choice {
  const fallback = { terminalId: printers.length === 1 ? printers[0].id : "", auto: true };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(storeId)) ?? "null") as Choice | null;
    if (saved && typeof saved.terminalId === "string" && printers.some((printer) => printer.id === saved.terminalId)) return { terminalId: saved.terminalId, auto: saved.auto !== false };
  } catch { /* sem armazenamento local: usa o padrão */ }
  return fallback;
}

/** Comprovante da venda recém-concluída: imprime sozinho se o caixa marcou "automático" e mostra o andamento. */
export function ReceiptPrinter({ saleId, printers, storeId }: { saleId: number; printers: PrinterOption[]; storeId: string }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  const started = useRef(false);

  const print = useCallback(async (terminalId: string) => {
    setStatus("sending"); setMessage("");
    try {
      const response = await fetch(`/api/sales/${saleId}/print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terminalId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível enviar para a impressora.");
      setStatus("QUEUED");
      for (let attempt = 0; attempt < 20 && alive.current; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const poll = await fetch(`/api/print/jobs/${body.jobId}`, { cache: "no-store" });
        if (!poll.ok) continue;
        const job = await poll.json() as { status: Status; error: string | null };
        if (!alive.current) return;
        setStatus(job.status);
        if (job.status === "PRINTED") return;
        if (job.status === "FAILED") { setMessage(job.error ?? ""); return; }
      }
      if (alive.current) setMessage("O agente da impressora não respondeu. Confira se ele está ligado no computador do caixa.");
    } catch (cause) {
      if (alive.current) { setStatus("error"); setMessage(cause instanceof Error ? cause.message : "Falha ao enviar."); }
    }
  }, [saleId]);

  useEffect(() => {
    alive.current = true;
    queueMicrotask(() => {
      const initial = readChoice(storeId, printers);
      setChoice(initial);
      if (!started.current && initial.auto && initial.terminalId) { started.current = true; void print(initial.terminalId); }
    });
    return () => { alive.current = false; };
  }, [storeId, printers, print]);

  if (!printers.length || !choice) return null;
  const save = (next: Choice) => {
    setChoice(next);
    try { localStorage.setItem(storageKey(storeId), JSON.stringify(next)); } catch { /* segue sem lembrar */ }
  };
  const busy = status === "sending" || status === "QUEUED" || status === "SENT";
  const tone = status === "PRINTED" ? "text-emerald-700" : status === "FAILED" || status === "error" ? "text-red-700" : "text-gray-500";

  return <div className="border rounded-xl p-3 mb-4 grid gap-2 text-left">
    <div className="flex items-center gap-2"><Printer size={16}/><b>Comprovante</b><span className={`ml-auto text-sm font-semibold ${tone}`}>{labels[status]}</span></div>
    {printers.length > 1 && <select className="field" aria-label="Impressora deste caixa" value={choice.terminalId} onChange={(event) => save({ ...choice, terminalId: event.target.value })}>
      <option value="">Escolha a impressora deste caixa</option>
      {printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}{printer.online ? "" : " (agente desconectado)"}</option>)}
    </select>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={choice.auto} onChange={(event) => save({ ...choice, auto: event.target.checked })}/>Imprimir automaticamente ao concluir a venda</label>
    {message && <p className="text-sm text-red-700">{message}</p>}
    <button type="button" className="btn btn-ghost" disabled={!choice.terminalId || busy} onClick={() => { save(choice); void print(choice.terminalId); }}>{status === "PRINTED" || status === "FAILED" ? "Imprimir de novo" : "Imprimir comprovante"}</button>
  </div>;
}
