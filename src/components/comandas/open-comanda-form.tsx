"use client";
import { useEffect, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { formatMoney } from "@/lib/money";
import { openSessionAction } from "@/modules/comandas/actions";

type Player = { id: string; name: string; email: string | null; phone: string | null; creditBalanceCents: number };

/* Abre a comanda para um jogador cadastrado ou para um cadastro provisório (só o nome), que o atendente completa ao fechar a conta. */
export function OpenComandaForm({ comandaId }: { comandaId: string }) {
  const [mode, setMode] = useState<"player" | "provisional">("player");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Player | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (mode !== "player" || query.trim().length < 2 || selected) { if (active) setResults([]); return; }
      const response = await fetch(`/api/pos/players?q=${encodeURIComponent(query)}`);
      if (response.ok && active) setResults(await response.json());
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, mode, selected]);

  return <ActionForm action={openSessionAction} submitLabel="Abrir comanda" className="grid gap-4">
    <input type="hidden" name="comandaId" value={comandaId}/>
    <input type="hidden" name="mode" value={mode}/>
    <div className="seg" role="tablist" aria-label="Quem é o cliente">
      <button type="button" role="tab" aria-selected={mode === "player"} className={mode === "player" ? "is-active" : ""} onClick={() => setMode("player")}>Jogador cadastrado</button>
      <button type="button" role="tab" aria-selected={mode === "provisional"} className={mode === "provisional" ? "is-active" : ""} onClick={() => setMode("provisional")}>Cadastro provisório</button>
    </div>
    {mode === "player" ? <div className="grid gap-2 relative">
      <input type="hidden" name="playerId" value={selected?.id ?? ""}/>
      <label className="label">Buscar jogador<input className="field" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Nome, e-mail ou telefone" autoComplete="off" autoFocus/></label>
      {results.length > 0 && <div className="pick-list">{results.map((player) => <button type="button" key={player.id} onClick={() => { setSelected(player); setQuery(player.name); setResults([]); }}>
        <span><b>{player.name}</b><small>{player.email || player.phone || "Sem contato"}</small></span><em>{formatMoney(player.creditBalanceCents)}</em>
      </button>)}</div>}
      {selected && <p className="field-hint">Cliente: <b>{selected.name}</b>. Se ainda não tem cadastro, use o cadastro provisório.</p>}
    </div> : <div className="grid gap-3">
      <label className="label">Nome do cliente<input className="field" name="name" minLength={2} maxLength={160} placeholder="Como o cliente se apresentou" required autoFocus/></label>
      <label className="label">Telefone (opcional)<input className="field" name="phone" inputMode="tel" maxLength={40} placeholder="(11) 90000-0000"/></label>
      <p className="field-hint">O cadastro provisório guarda só o que você digitou aqui. Ao fechar a conta, o sistema oferece completar os dados do cliente.</p>
    </div>}
  </ActionForm>;
}
