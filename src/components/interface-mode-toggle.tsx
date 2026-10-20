"use client";

import { History, PanelsTopLeft } from "lucide-react";
import { useInterfaceMode } from "@/components/interface-mode-provider";

export function InterfaceModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, pending, setMode } = useInterfaceMode();
  if (compact) {
    const modern = mode === "MODERN";
    const Icon = modern ? PanelsTopLeft : History;
    return <button className="interface-quick-toggle" type="button" disabled={pending} onClick={() => setMode(modern ? "LEGACY" : "MODERN")} title={`Visual atual: ${modern ? "Novo" : "Legado"}. Alternar.`} aria-label={`Visual atual: ${modern ? "Novo" : "Legado"}. Alternar para ${modern ? "Legado" : "Novo"}.`}><Icon size={18}/></button>;
  }
  return <div className="interface-mode-switcher" aria-label="Estilo da interface">
    <button type="button" className={mode === "LEGACY" ? "is-active" : ""} disabled={pending} onClick={() => setMode("LEGACY")} aria-pressed={mode === "LEGACY"}><History size={15}/><span>Legado</span></button>
    <button type="button" className={mode === "MODERN" ? "is-active" : ""} disabled={pending} onClick={() => setMode("MODERN")} aria-pressed={mode === "MODERN"}><PanelsTopLeft size={15}/><span>Novo</span></button>
  </div>;
}
