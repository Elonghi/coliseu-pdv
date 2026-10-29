import { PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { paymentMethodAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage() {
  const methods = await pool.query<{ code: string; name: string; active: boolean }>("SELECT code,name,active FROM payment_methods ORDER BY sort_order");
  return <div className="section-gap">
    <PageHeader eyebrow="Configurações" title="Formas de pagamento" description="Escolha quais formas de pagamento ficam disponíveis no PDV."/>
    <section className="card">
      {methods.rows.map((method) => <form action={paymentMethodAction} className="row-form grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto]" key={method.code}>
        <input type="hidden" name="code" value={method.code}/>
        <span className="cell-main"><b>{method.name}</b><small className="mono">{method.code}</small></span>
        <label className="switch"><input type="checkbox" name="active" defaultChecked={method.active}/><span>Ativa</span></label>
        <button className="btn btn-ghost btn-sm">Salvar</button>
      </form>)}
    </section>
  </div>;
}
