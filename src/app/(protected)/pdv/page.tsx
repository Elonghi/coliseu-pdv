import { redirect } from "next/navigation";
import { pool } from "@/db";
import { PosClient } from "@/components/pos-client";
import { StoreSwitcher } from "@/components/store-switcher";
import { requireUser } from "@/modules/auth/session";
export const dynamic="force-dynamic";
export default async function PosPage(){const user=await requireUser();if(user.isPlatformAdmin&&!user.accountId)redirect("/plataforma");if(user.consolidated)return <main className="pos-choose-store"><h1>Escolha a loja do caixa</h1><p>O caixa registra vendas em uma loja específica. Você tem acesso a mais de uma: escolha em qual vai trabalhar.</p><StoreSwitcher stores={user.stores} activeStoreId={user.activeStoreId} consolidated={user.consolidated}/></main>;const methods=await pool.query("SELECT pm.code,pm.name FROM payment_methods pm JOIN store_payment_methods spm ON spm.code=pm.code AND spm.store_id=app_current_store() WHERE pm.active AND spm.active ORDER BY pm.sort_order");return <PosClient methods={methods.rows} userName={user.name} isAdmin={user.role==="ADMIN"}/>}
