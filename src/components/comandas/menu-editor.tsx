"use client";
import { useMemo, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { formatMoney } from "@/lib/money";
import { saveMenuAction } from "@/modules/comandas/actions";

type Product = { id: string; name: string; sku: string; priceCents: number; category: string; stock: number; onMenu: boolean };

/* Escolha do que o cliente pode pedir pelo celular. Tudo começa desligado; marque por produto ou por categoria. */
export function MenuEditor({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState(() => new Set(products.filter((product) => product.onMenu).map((product) => product.id)));
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const product of products) {
      if (filter && !`${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(filter.toLowerCase())) continue;
      map.set(product.category, [...(map.get(product.category) ?? []), product]);
    }
    return [...map];
  }, [products, filter]);
  const set = (ids: string[], on: boolean) => setSelected((current) => { const next = new Set(current); for (const id of ids) { if (on) next.add(id); else next.delete(id); } return next; });

  return <ActionForm action={saveMenuAction} submitLabel="Salvar cardápio" className="grid gap-4" stickyActions>
    {[...selected].map((id) => <input key={id} type="hidden" name="productId" value={id}/>)}
    <div className="menu-tools">
      <input className="field" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filtrar por nome, SKU ou categoria" aria-label="Filtrar produtos"/>
      <span className="badge badge-ok">{selected.size} no cardápio</span>
    </div>
    {groups.length === 0 && <p className="field-hint">Nenhum produto encontrado.</p>}
    {groups.map(([category, items]) => {
      const allOn = items.every((item) => selected.has(item.id));
      return <fieldset key={category} className="menu-group">
        <legend>{category}</legend>
        <div className="menu-group-actions"><button type="button" className="link-row" onClick={() => set(items.map((item) => item.id), !allOn)}>{allOn ? "Desmarcar todos" : "Marcar todos"}</button></div>
        {items.map((item) => <label key={item.id} className="menu-row">
          <input type="checkbox" checked={selected.has(item.id)} onChange={(event) => set([item.id], event.target.checked)}/>
          <span><b>{item.name}</b><small>{item.sku} · estoque {item.stock}</small></span>
          <em>{formatMoney(item.priceCents)}</em>
        </label>)}
      </fieldset>;
    })}
  </ActionForm>;
}
