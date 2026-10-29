import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { Badge, PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { formatDateTime, formatDueDate } from "@/lib/format";
import { formatMoney, saleNumber } from "@/lib/money";
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
  const canceled = current.status === "CANCELED";

  return <div className="section-gap">
    <PageHeader
      back={{ href: "/admin/sales", label: "Vendas" }}
      eyebrow={`${formatDateTime(current.created_at)} · ${current.operator}`}
      title={saleNumber(current.id)}
      actions={<>
        <Badge tone={canceled ? "danger" : "ok"} dot>{canceled ? "Cancelada" : "Confirmada"}</Badge>
        {!canceled && user.role === "ADMIN" && <Modal trigger={<><Ban size={15}/>Cancelar venda</>} triggerClassName="btn btn-danger" size="sm" title="Cancelar venda" description={`${saleNumber(current.id)}: os itens voltam ao estoque e créditos de jogadores são estornados. Esta ação não pode ser desfeita.`}>
          <ActionForm action={cancelSaleAction} submitLabel="Confirmar cancelamento" submitVariant="danger-solid" className="grid gap-4">
            <input type="hidden" name="saleId" value={current.id}/>
            <label className="label">Motivo do cancelamento<textarea className="field" name="reason" minLength={5} required placeholder="Explique por que a venda está sendo cancelada"/></label>
          </ActionForm>
        </Modal>}
      </>}
    />

    {canceled && <section className="notice-error"><b>Venda cancelada por {current.canceled_by}</b><br/>{current.cancellation_reason}</section>}

    <section className="stat-grid" aria-label="Valores da venda">
      <article className="card stat"><span className="stat-body"><span className="stat-label">Subtotal</span><strong className="stat-value">{formatMoney(current.subtotal_cents)}</strong></span></article>
      <article className="card stat"><span className="stat-body"><span className="stat-label">Desconto</span><strong className="stat-value">{formatMoney(current.discount_cents)}</strong></span></article>
      <article className="card stat stat-primary"><span className="stat-body"><span className="stat-label">Total</span><strong className="stat-value">{formatMoney(current.total_cents)}</strong></span></article>
    </section>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
      <section className="card">
        <div className="panel-head"><h2 className="panel-title">Itens ({items.rowCount})</h2></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Produto</th><th className="num">Qtd.</th><th className="num">Unitário</th><th className="num">Desconto</th><th className="num">Total</th></tr></thead>
          <tbody>{items.rows.map((item) => <tr key={item.id}>
            <td className="cell-wrap"><span className="cell-main"><b>{item.product_name}</b><small>{item.sku}</small></span></td>
            <td className="num">{item.quantity}</td>
            <td className="num">{formatMoney(item.unit_price_cents)}</td>
            <td className="num">{item.discount_cents ? <span className="cell-main"><b>{(item.discount_bps / 100).toFixed(2)}%</b><small>{formatMoney(item.discount_cents)}</small></span> : <span className="muted">—</span>}</td>
            <td className="num"><b>{formatMoney(item.total_cents)}</b></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="card">
        <div className="panel-head"><h2 className="panel-title">Pagamentos</h2></div>
        <div>{payments.rows.map((payment) => <div key={payment.id} className="row-form grid-cols-[1fr_auto]">
          <span className="cell-main"><b>{payment.method}</b>{payment.player_name && <small>{payment.player_name}{payment.due_date ? ` · vence ${formatDueDate(payment.due_date)}` : ""}</small>}</span>
          <span className="cell-main num"><b>{formatMoney(payment.amount_applied_cents)}</b>{payment.change_cents > 0 && <small>Troco {formatMoney(payment.change_cents)}</small>}</span>
        </div>)}</div>
      </section>
    </div>
  </div>;
}
