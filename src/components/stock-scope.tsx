import { Store } from "lucide-react";

type ScopeUser = { stores: { id: string; name: string }[]; activeStoreId: string | null; consolidated: boolean };

/* Diz de qual loja é a lista. Cada loja tem os seus produtos e o seu saldo; na visão de todas as lojas aparecem os produtos de
 * todas, cada um com a sua loja. Com uma loja só não há o que explicar. */
export function StockScope({ user }: { user: ScopeUser }) {
  if (user.stores.length < 2) return null;
  const active = user.stores.find((store) => store.id === user.activeStoreId);
  return <p className="stock-scope" role="status">
    <Store size={14}/>
    {user.consolidated || !active
      ? <span>Produtos e saldos das <b>{user.stores.length} lojas</b>, cada item com a sua loja. Escolha uma loja no seletor para cadastrar, ajustar ou abrir box.</span>
      : <span>Produtos e saldo da loja <b>{active.name}</b>. Os de outras lojas não aparecem aqui.</span>}
  </p>;
}

/* De qual loja é o produto: o nome da loja (só na visão de todas as lojas) ou "Compartilhado" (vale em todas). */
export function ProductStoreTag({ storeId, stores, showStore }: { storeId: string | null; stores: { id: string; name: string }[]; showStore: boolean }) {
  if (!storeId) return <small className="stock-breakdown">Compartilhado entre as lojas</small>;
  if (!showStore) return null;
  return <small className="stock-breakdown">{stores.find((store) => store.id === storeId)?.name ?? "Outra loja"}</small>;
}

/* "Centro 5 · Shopping 0": o saldo de cada loja, para produtos compartilhados na visão de todas as lojas. */
export function StoreBreakdown({ parts }: { parts?: { name: string; quantity: number }[] }) {
  if (!parts?.length) return null;
  return <small className="stock-breakdown">{parts.map((part) => `${part.name} ${part.quantity}`).join(" · ")}</small>;
}
