import { notFound } from "next/navigation";
import Link from "next/link";
import { pool } from "@/db";
import { formatMoney, saleNumber } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { cancelSaleAction } from "@/modules/admin/actions";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";

export const dynamic = "force-dynamic";

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(permissions.SALES_VIEW);
  const { id } = await params;
  const sale = await pool.query(`SELECT s.*,u.name operator,cu.name canceled_by FROM sales s
    JOIN users u ON u.id=s.operator_id LEFT JOIN users cu ON cu.id=s.canceled_by_id
    WHERE s.id=$1 AND ($2::boolean OR s.operator_id=$3)`, [id, user.role === "ADMIN", user.id]);
  const current = sale.rows[0];
  if (!current) notFound();
  const [items, payments] = await Promise.all([
    pool.query("SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY product_name", [id]),
    pool.query("SELECT p.*,pm.name method,pl.name player_name FROM payments p JOIN payment_methods pm ON pm.code=p.method_code LEFT JOIN players pl ON pl.id=p.player_id WHERE p.sale_id=$1 ORDER BY pm.sort_order", [id]),
  ]);

  return <div className="grid gap-5">
    <header><Link href="/admin/sales" className="text-sm font-bold text-gray-500">← Vendas</Link><h1 className="text-3xl font-black mt-2">{saleNumber(current.id)}</h1><p className="text-gray-500">{new Date(current.created_at).toLocaleString("pt-BR")} · {current.operator}</p></header>
    <section className="grid sm:grid-cols-3 gap-3"><article className="card p-4"><small>Subtotal</small><b className="block text-xl">{formatMoney(current.subtotal_cents)}</b></article><article className="card p-4"><small>Desconto</small><b className="block text-xl">{formatMoney(current.discount_cents)}</b></article><article className="card p-4"><small>Total</small><b className="block text-xl">{formatMoney(current.total_cents)}</b></article></section>
    <section className="card table-wrap"><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Desconto</th><th>Total</th></tr></thead><tbody>{items.rows.map((item) => <tr key={item.id}><td><b>{item.product_name}</b><br/><small>{item.sku}</small></td><td>{item.quantity}</td><td>{formatMoney(item.unit_price_cents)}</td><td>{(item.discount_bps / 100).toFixed(2)}% ({formatMoney(item.discount_cents)})</td><td>{formatMoney(item.total_cents)}</td></tr>)}</tbody></table></section>
    <section className="card p-5"><h2 className="font-black mb-3">Pagamentos</h2><div className="grid gap-2">{payments.rows.map((payment) => <div key={payment.id} className="flex justify-between border-b py-2"><span>{payment.method}{payment.player_name && <small className="block text-gray-500">{payment.player_name}{payment.due_date ? ` · vence ${new Date(`${payment.due_date}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</small>}</span><b>{formatMoney(payment.amount_applied_cents)}{payment.change_cents > 0 && ` · Troco ${formatMoney(payment.change_cents)}`}</b></div>)}</div></section>
    {current.status === "CANCELED"
      ? <section className="notice-error"><b>Venda cancelada por {current.canceled_by}</b><br/>{current.cancellation_reason}</section>
      : user.role === "ADMIN" && <ActionForm action={cancelSaleAction} className="card p-5 grid gap-3 max-w-xl"><input type="hidden" name="saleId" value={current.id}/><h2 className="font-black text-red-700">Cancelar venda</h2><label className="label">Motivo<textarea className="field" name="reason" minLength={5} required/></label></ActionForm>}
  </div>;
}
