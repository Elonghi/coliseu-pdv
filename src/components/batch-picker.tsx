"use client";
import { useState } from "react";
import { formatMoney } from "@/lib/money";

type Option = { id: string; title: string; detail: string; cents: number };

/** Lista de duplicatas com seleção múltipla; envia os marcados como `installmentIds`. */
export function BatchPicker({ options }: { options: Option[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const total = options.filter((option) => selected.has(option.id)).reduce((sum, option) => sum + option.cents, 0);
  const allSelected = selected.size === options.length && options.length > 0;
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return <div className="grid gap-2 sm:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label className="switch"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(options.map((option) => option.id)))}/><span>Selecionar todas</span></label>
      <span className="text-sm muted"><b className="ink">{selected.size}</b> selecionada(s) · <b className="ink">{formatMoney(total)}</b></span>
    </div>
    <div className="batch-list" role="group" aria-label="Duplicatas em aberto">
      {options.map((option) => <label className="check-card" key={option.id}>
        <input type="checkbox" name="installmentIds" value={option.id} checked={selected.has(option.id)} onChange={() => toggle(option.id)}/>
        <span className="cell-main flex-1"><b>{option.title}</b><small>{option.detail}</small></span>
        <b>{formatMoney(option.cents)}</b>
      </label>)}
    </div>
  </div>;
}
