"use client";
import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { TokenActionState } from "@/modules/printing/actions";

/** Formulário que devolve um token de agente. Depois de salvar, mostra o endereço e o token (uma única vez) para o
 * instalador do Windows e o config.json pronto para o Linux. */
export function PrinterTokenForm({ action, submitLabel, submitVariant = "primary", children }: {
  action: (state: TokenActionState, data: FormData) => Promise<TokenActionState>;
  submitLabel: string;
  submitVariant?: "primary" | "danger";
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  if (state.token) return <AgentConfig token={state.token} message={state.ok}/>;
  return <form action={formAction} className="grid gap-4">
    {children}
    {state.error && <p className="notice-error">{state.error}</p>}
    <button className={`btn btn-${submitVariant}`} disabled={pending}>{pending ? "Salvando..." : submitLabel}</button>
  </form>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };
  return <button type="button" className="btn btn-ghost shrink-0" onClick={copy} aria-label={label}>{copied ? <><Check size={16}/>Copiado</> : <><Copy size={16}/>Copiar</>}</button>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 break-all">{value}</code>
      <CopyButton value={value} label={`Copiar ${label.toLowerCase()}`}/>
    </div>
  </div>;
}

function AgentConfig({ token, message }: { token: string; message?: string }) {
  const server = typeof window === "undefined" ? "" : window.location.origin;
  const config = JSON.stringify({ server, token, printer: "POS-8370" }, null, 2);
  return <div className="grid gap-4">
    {message && <p className="notice-ok">{message}</p>}
    <p className="text-sm text-gray-600">O token aparece só agora. No Windows, rode o instalador do agente no computador do caixa e cole estes dois dados quando ele pedir.</p>
    <CopyField label="Endereço do sistema" value={server}/>
    <CopyField label="Token da impressora" value={token}/>
    <details className="text-sm text-gray-600">
      <summary className="cursor-pointer">Linux ou instalação manual: config.json</summary>
      <div className="mt-2 grid gap-2">
        <p>Salve como <code>config.json</code> na mesma pasta do agente. Troque <code>printer</code> pelo nome da impressora no sistema (no Linux, veja com <code>lpstat -e</code>).</p>
        <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{config}</pre>
        <CopyButton value={config} label="Copiar config.json"/>
      </div>
    </details>
  </div>;
}
