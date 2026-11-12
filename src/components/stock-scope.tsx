import { Store } from "lucide-react";

type ScopeUser = { stores: { id: string; name: string }[]; activeStoreId: string | null; consolidated: boolean };

/* Diz de qual loja é o saldo mostrado. O catálogo de produtos é do lojista e aparece igual em todas as lojas; o que muda com a
 * loja ativa é o saldo. Com uma loja só não há o que explicar. */
export function StockScope({ user }: { user: ScopeUser }) {
  if (user.stores.length < 2) return null;
  const active = user.stores.find((store) => store.id === user.activeStoreId);
  return <p className="stock-scope" role="status">
    <Store size={14}/>
    {user.consolidated || !active
      ? <span>Saldo somado das <b>{user.stores.length} lojas</b>. Escolha uma loja no seletor para ver o saldo dela.</span>
      : <span>Saldo da loja <b>{active.name}</b>. Produtos sem saldo aqui mostram 0.</span>}
  </p>;
}

/* "Centro 5 · Shopping 0": o saldo de cada loja, para a visão de todas as lojas. */
export function StoreBreakdown({ parts }: { parts?: { name: string; quantity: number }[] }) {
  if (!parts?.length) return null;
  return <small className="stock-breakdown">{parts.map((part) => `${part.name} ${part.quantity}`).join(" · ")}</small>;
}
