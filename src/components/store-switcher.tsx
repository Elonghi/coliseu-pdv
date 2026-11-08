"use client";
import { useRef } from "react";
import { Store } from "lucide-react";
import { selectStoreAction } from "@/modules/auth/store-actions";
import { ALL_STORES } from "@/modules/auth/stores";

type StoreOption = { id: string; name: string };

/* Seletor de loja: aparece só para quem tem mais de uma. "Todas as lojas" é a visão consolidada, que só lê. */
export function StoreSwitcher({ stores, activeStoreId, consolidated, className }: { stores: StoreOption[]; activeStoreId: string | null; consolidated: boolean; className?: string }) {
  const form = useRef<HTMLFormElement>(null);
  if (stores.length < 2) return null;
  return <form ref={form} action={selectStoreAction} className={`store-switcher ${className ?? ""}`}>
    <label>
      <span><Store size={13}/>Loja</span>
      <select name="store" value={consolidated ? ALL_STORES : activeStoreId ?? ""} onChange={() => form.current?.requestSubmit()} aria-label="Loja ativa">
        <option value={ALL_STORES}>Todas as lojas</option>
        {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </label>
  </form>;
}
