import { redirect } from "next/navigation";
import { pool } from "@/db";
import { PosClient } from "@/components/pos-client";
import type { PrinterOption } from "@/components/receipt-printer";
import { StoreSwitcher } from "@/components/store-switcher";
import { requireUser } from "@/modules/auth/session";
import { loadSessionCart } from "@/modules/comandas/service";
import { AGENT_ONLINE_MS } from "@/modules/printing/service";

export const dynamic = "force-dynamic";

/* Impressoras da loja. Se a tabela ainda não existir (código publicado antes da migration 0021), o caixa segue sem impressão. */
async function storePrinters(): Promise<PrinterOption[]> {
  try {
    const result = await pool.query<PrinterOption>("SELECT id,name,COALESCE(last_seen_at > now() - make_interval(secs => $1),false) online FROM print_terminals WHERE active ORDER BY name", [AGENT_ONLINE_MS / 1000]);
    return result.rows;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw error;
  }
}

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
  const [methods, printers] = await Promise.all([
    pool.query("SELECT pm.code,pm.name FROM payment_methods pm JOIN store_payment_methods spm ON spm.code=pm.code AND spm.store_id=app_current_store() WHERE pm.active AND spm.active ORDER BY pm.sort_order"),
    storePrinters(),
  ]);
  return <PosClient methods={methods.rows} userName={user.name} isAdmin={user.role === "ADMIN"} comanda={cart ?? undefined} comandaUnavailable={Boolean(comanda) && !cart} printers={printers} storeId={user.activeStoreId}/>;
}
