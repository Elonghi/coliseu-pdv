import { redirect } from "next/navigation";
import { pool } from "@/db";
import { PosClient } from "@/components/pos-client";
import { StoreSwitcher } from "@/components/store-switcher";
import { requireUser } from "@/modules/auth/session";
import { loadSessionCart } from "@/modules/comandas/service";

export const dynamic = "force-dynamic";

/* Frente de caixa. Com `?comanda=<abertura>`, cobra a conta de uma comanda: o carrinho é a conta dela e a venda a encerra.
 * Se a comanda já foi encerrada, não redireciona: a tela avisa. (Depois de cobrar, uma atualização da página não pode derrubar a tela de sucesso.) */
export default async function PosPage({ searchParams }: { searchParams: Promise<{ comanda?: string }> }) {
  const user = await requireUser();
  if (user.isPlatformAdmin && !user.accountId) redirect("/plataforma");
  if (user.consolidated) {
    return <main className="pos-choose-store"><h1>Escolha a loja do caixa</h1><p>O caixa registra vendas em uma loja específica. Você tem acesso a mais de uma: escolha em qual vai trabalhar.</p><StoreSwitcher stores={user.stores} activeStoreId={user.activeStoreId} consolidated={user.consolidated}/></main>;
  }
  const { comanda } = await searchParams;
  const cart = comanda && /^[0-9a-f-]{36}$/i.test(comanda) ? await loadSessionCart(comanda) : null;
  const methods = await pool.query("SELECT pm.code,pm.name FROM payment_methods pm JOIN store_payment_methods spm ON spm.code=pm.code AND spm.store_id=app_current_store() WHERE pm.active AND spm.active ORDER BY pm.sort_order");
  return <PosClient methods={methods.rows} userName={user.name} isAdmin={user.role === "ADMIN"} comanda={cart ?? undefined} comandaUnavailable={Boolean(comanda) && !cart}/>;
}
