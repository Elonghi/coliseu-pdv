"use client";
import { useEffect, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { formatMoney } from "@/lib/money";
import { addCounterOrderAction } from "@/modules/comandas/actions";

type Product = { id: string; name: string; sku: string; salePriceCents: number; stockQuantity: number };

/* O balcão lança um item direto na comanda (qualquer produto ativo, mesmo os que não estão no cardápio do celular). */
export function CounterAddItem({ sessionId }: { sessionId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (query.trim().length < 2 || selected) { if (active) setResults([]); return; }
      const response = await fetch(`/api/pos/products?q=${encodeURIComponent(query)}`);
      if (response.ok && active) setResults(await response.json());
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, selected]);

  return <ActionForm action={addCounterOrderAction} submitLabel="Lançar na comanda" className="grid gap-4">
    <input type="hidden" name="sessionId" value={sessionId}/>
    <input type="hidden" name="productId" value={selected?.id ?? ""}/>
    <div className="grid gap-2 relative">
      <label className="label">Produto<input className="field" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Nome, SKU ou código de barras" autoComplete="off" autoFocus/></label>
      {results.length > 0 && <div className="pick-list">{results.map((product) => <button type="button" key={product.id} onClick={() => { setSelected(product); setQuery(product.name); setResults([]); }}>
        <span><b>{product.name}</b><small>{product.sku} · estoque {product.stockQuantity}</small></span><em>{formatMoney(product.salePriceCents)}</em>
      </button>)}</div>}
    </div>
    <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
      <label className="label">Quantidade<input className="field" name="quantity" type="number" min={1} max={99} step={1} defaultValue={1} required/></label>
      <label className="label">Observação (opcional)<input className="field" name="note" maxLength={200} placeholder="Ex.: sem gelo"/></label>
    </div>
    {!selected && <p className="field-hint">Busque e escolha o produto na lista para habilitar o lançamento.</p>}
  </ActionForm>;
}
