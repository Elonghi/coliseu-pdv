"use client";
import { Fragment, useState } from "react";
import { CircleCheck, CircleHelp, CircleX } from "lucide-react";

type Choice = "RECEIVED" | "MISSING" | "SKIPPED";
type ChecklistItem = { id: string; name: string; detail: string; quantity: number; unit: string; initial: Choice };

const choices: { value: Choice; label: string }[] = [
  { value: "RECEIVED", label: "Chegou" },
  { value: "MISSING", label: "Faltou" },
  { value: "SKIPPED", label: "Não entra no estoque" },
];

/** Conferência do recebimento: cada item da nota chegou, faltou ou não deve entrar no estoque. */
export function FiscalReceiptChecklist({ items }: { items: ChecklistItem[] }) {
  const [state, setState] = useState(() => Object.fromEntries(items.map((item) => [item.id, { choice: item.initial, quantity: String(item.quantity) }])));
  const [review, setReview] = useState(() => items.some((item) => item.initial !== "RECEIVED"));

  const setAll = () => { setState(Object.fromEntries(items.map((item) => [item.id, { choice: "RECEIVED" as Choice, quantity: String(item.quantity) }]))); setReview(false); };
  const update = (id: string, patch: Partial<{ choice: Choice; quantity: string }>) => setState((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const received = items.filter((item) => state[item.id].choice === "RECEIVED");
  const units = received.reduce((total, item) => total + (Number(state[item.id].quantity) || 0), 0);
  const missing = items.filter((item) => state[item.id].choice === "MISSING").length;
  const skipped = items.filter((item) => state[item.id].choice === "SKIPPED").length;
  const short = received.filter((item) => (Number(state[item.id].quantity) || 0) < item.quantity).length;

  return <div className="grid gap-4">
    <div className="receipt-question" role="group" aria-label="Todos os itens da nota chegaram?">
      <p>Todos os itens da nota chegaram?</p>
      <div className="chip-group">
        <button type="button" className={`chip ${!review ? "is-active" : ""}`} onClick={setAll}>Sim, tudo chegou</button>
        <button type="button" className={`chip ${review ? "is-active" : ""}`} onClick={() => setReview(true)}>Não, conferir item a item</button>
      </div>
    </div>

    {items.map((item) => <Fragment key={item.id}>
      <input type="hidden" name={`action_${item.id}`} value={state[item.id].choice}/>
      <input type="hidden" name={`quantity_${item.id}`} value={state[item.id].choice === "RECEIVED" ? state[item.id].quantity : ""}/>
    </Fragment>)}

    <ul className={`receipt-list ${review ? "is-review" : ""}`}>
      {items.map((item) => {
        const current = state[item.id];
        const quantity = Number(current.quantity) || 0;
        return <li key={item.id} className={`receipt-item is-${current.choice.toLowerCase()}`}>
          <span className="receipt-icon" aria-hidden="true">{current.choice === "RECEIVED" ? <CircleCheck size={18}/> : current.choice === "MISSING" ? <CircleHelp size={18}/> : <CircleX size={18}/>}</span>
          <span className="cell-main"><b>{item.name}</b><small>{item.detail}</small></span>
          {review && <span className="receipt-controls">
            <select className="field" aria-label={`Situação de ${item.name}`} value={current.choice} onChange={(event) => update(item.id, { choice: event.target.value as Choice, quantity: String(item.quantity) })}>
              {choices.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}
            </select>
            {current.choice === "RECEIVED" && <label className="receipt-quantity">
              <input className="field" type="number" min="1" max={item.quantity} step="1" inputMode="numeric" aria-label={`Quantidade recebida de ${item.name}`} value={current.quantity} onChange={(event) => update(item.id, { quantity: event.target.value })}/>
              <span>de {item.quantity} {item.unit}</span>
            </label>}
          </span>}
          {!review && <span className="receipt-static">{item.quantity} {item.unit}</span>}
          {review && current.choice === "RECEIVED" && quantity > 0 && quantity < item.quantity && <small className="receipt-warning">Faltam {item.quantity - quantity} {item.unit} — a nota traz {item.quantity}.</small>}
          {review && current.choice === "MISSING" && <small className="receipt-warning">Não entra agora. Fica como “falta” e pode ser lançado quando chegar.</small>}
          {review && current.choice === "SKIPPED" && <small className="receipt-note">Não será lançado no estoque (ex.: frete, embalagem, material de uso).</small>}
        </li>;
      })}
    </ul>

    <p className="receipt-summary" aria-live="polite">
      <b>{received.length}</b> de {items.length} item(ns) entram no estoque ({units} unidade(s))
      {short > 0 && <> · <b>{short}</b> com quantidade menor que a nota</>}
      {missing > 0 && <> · <b>{missing}</b> com falta</>}
      {skipped > 0 && <> · <b>{skipped}</b> fora do estoque</>}
    </p>
  </div>;
}
