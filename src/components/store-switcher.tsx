"use client";
import { useOptimistic, useTransition } from "react";
import { Store } from "lucide-react";
import { selectStoreAction } from "@/modules/auth/store-actions";
import { ALL_STORES } from "@/modules/auth/stores";

type StoreOption = { id: string; name: string };

/* Seletor de loja: aparece só para quem tem mais de uma. "Todas as lojas" é a visão consolidada, que só lê.
 * Não usa <form action>: o React 19 reinicia o formulário quando a ação termina, e o select voltava para a loja anterior
 * enquanto o painel já mostrava a nova. O valor mostrado é otimista (muda na hora) e passa a vir do servidor ao fim da troca. */
export function StoreSwitcher({ stores, activeStoreId, consolidated, className }: { stores: StoreOption[]; activeStoreId: string | null; consolidated: boolean; className?: string }) {
  const [selected, setSelected] = useOptimistic(consolidated ? ALL_STORES : activeStoreId ?? "");
  const [pending, startTransition] = useTransition();
  if (stores.length < 2) return null;

  const choose = (store: string) => startTransition(async () => {
    setSelected(store);
    const data = new FormData();
    data.set("store", store);
    await selectStoreAction(data);
  });

  return <div className={`store-switcher ${className ?? ""}`}>
    <label>
      <span><Store size={13}/>Loja</span>
      <select name="store" value={selected} onChange={(event) => choose(event.target.value)} aria-label="Loja ativa" aria-busy={pending}>
        <option value={ALL_STORES}>Todas as lojas</option>
        {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </label>
  </div>;
}
