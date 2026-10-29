import { notFound } from "next/navigation";
import { Send } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { formatDueDate, formatSigned } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { purchaseStatus } from "@/lib/purchase-status";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { purchaseItemAction, purchaseLinkInvoiceAction, purchaseReceiveAction, purchaseSendAction } from "@/modules/purchases/actions";

export const dynamic = "force-dynamic";

const steps = ["Rascunho", "Enviado ao fornecedor", "Em recebimento", "Concluído"];
const stepIndex: Record<string, number> = { DRAFT: 0, SENT: 1, PARTIAL: 2, RECEIVED: 3 };

export default async function PurchaseDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(permissions.PURCHASE_MANAGE);
  const { id } = await params;
  const [order, items, products, invoices] = await Promise.all([
    pool.query("SELECT po.*,s.name supplier,fi.number invoice_number,fi.total_cents invoice_total FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id LEFT JOIN fiscal_invoices fi ON fi.id=po.fiscal_invoice_id WHERE po.id=$1", [id]),
    pool.query("SELECT poi.*,p.name product,p.sku FROM purchase_order_items poi JOIN products p ON p.id=poi.product_id WHERE poi.order_id=$1 ORDER BY p.name", [id]),
    pool.query("SELECT id,sku,name,cost_cents FROM products WHERE active=true ORDER BY name LIMIT 500"),
    pool.query("SELECT id,number,issuer_name,total_cents FROM fiscal_invoices WHERE status='AUTHORIZED' AND has_full_xml=true ORDER BY issue_at DESC LIMIT 100"),
  ]);
  const data = order.rows[0];
  if (!data) notFound();
  const editable = data.status === "DRAFT";
  const awaitingReceipt = ["SENT", "PARTIAL"].includes(data.status);
  const receivable = awaitingReceipt && !data.fiscal_invoice_id;
  const info = purchaseStatus[data.status] ?? { label: data.status, tone: "neutral" as const };
  const current = stepIndex[data.status];
  const orderTotal = items.rows.reduce((total, item) => total + item.ordered_quantity * item.unit_cost_cents, 0);

  return <div className="section-gap">
    <PageHeader
      back={{ href: "/admin/purchases", label: "Pedidos de compra" }}
      eyebrow={`Pedido PC-${String(data.number).padStart(6, "0")}`}
      title={data.supplier}
      description={data.invoice_number ? `NF-e ${data.invoice_number} vinculada` : undefined}
      actions={<>
        <Badge tone={info.tone} dot>{info.label}</Badge>
        {editable && <Modal trigger={<><Send size={15}/>Enviar pedido</>} triggerClassName="btn btn-primary" size="sm" title="Enviar pedido ao fornecedor" description="Depois de enviado, os itens não podem mais ser editados. O pedido precisa ter ao menos um item.">
          <ActionForm action={purchaseSendAction} submitLabel="Enviar pedido" className="grid gap-4"><input type="hidden" name="orderId" value={id}/></ActionForm>
        </Modal>}
      </>}
    />

    {current !== undefined && <ol className="steps" aria-label="Andamento do pedido">{steps.map((step, index) => <li key={step} className={`step ${index < current || data.status === "RECEIVED" ? "is-done" : index === current ? "is-current" : ""}`}>{step}</li>)}</ol>}

    <section className="card panel-body"><dl className="kv">
      <div><dt>Previsão de entrega</dt><dd>{formatDueDate(data.expected_at)}</dd></div>
      <div><dt>Itens no pedido</dt><dd>{items.rowCount}</dd></div>
      <div><dt>Valor do pedido</dt><dd>{formatMoney(orderTotal)}</dd></div>
      {data.notes && <div><dt>Observações</dt><dd>{data.notes}</dd></div>}
    </dl></section>

    {editable && <ActionForm action={purchaseItemAction} submitLabel="Adicionar / atualizar item" className="card form-section sm:grid-cols-2 lg:grid-cols-4 items-end">
      <div className="form-section-head sm:col-span-2 lg:col-span-4"><h2>Adicionar item</h2><p>Informar um produto já existente no pedido atualiza a quantidade e o custo.</p></div>
      <input type="hidden" name="orderId" value={id}/>
      <label className="label lg:col-span-2">Produto<select className="field" name="productId">{products.rows.map((row) => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select></label>
      <label className="label">Quantidade<input className="field" type="number" min="1" name="quantity" required/></label>
      <label className="label">Custo unitário (R$)<input className="field" name="unitCost" inputMode="decimal" placeholder="0,00" required/></label>
    </ActionForm>}

    {awaitingReceipt && !data.fiscal_invoice_id && <ActionForm action={purchaseLinkInvoiceAction} submitLabel="Vincular e conferir NF-e" className="card form-section">
      <div className="form-section-head"><h2>Conferir com a NF-e recebida</h2><p>Vincule a nota do fornecedor para conferir as quantidades do pedido.</p></div>
      <input type="hidden" name="orderId" value={id}/>
      <label className="label">NF-e recebida<select className="field" name="invoiceId">{invoices.rows.map((row) => <option key={row.id} value={row.id}>NF-e {row.number} · {row.issuer_name} · {formatMoney(Number(row.total_cents))}</option>)}</select></label>
    </ActionForm>}

    <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">Itens e conferência</h2>{receivable && <p className="panel-desc">Sem NF-e, informe quanto chegou de cada item para registrar o recebimento manual.</p>}</div></div>
      {!items.rowCount ? <EmptyState title="Nenhum item no pedido" description={editable ? "Use o formulário acima para adicionar produtos." : undefined}/>
        : receivable
          ? <ActionForm action={purchaseReceiveAction} submitLabel="Registrar recebimento manual" className="grid">
              <input type="hidden" name="orderId" value={id}/>
              <div className="table-wrap"><table>
                <thead><tr><th>Produto</th><th className="num">Pedido</th><th className="num">Recebido</th><th className="num">Custo</th><th>Receber agora</th></tr></thead>
                <tbody>{items.rows.map((item) => <tr key={item.id}>
                  <td className="cell-wrap"><span className="cell-main"><b>{item.product}</b><small>{item.sku}</small></span></td>
                  <td className="num">{item.ordered_quantity}</td>
                  <td className="num">{item.received_quantity}</td>
                  <td className="num">{formatMoney(item.unit_cost_cents)}</td>
                  <td><input className="field" type="number" min="0" max={item.ordered_quantity - item.received_quantity} defaultValue="0" name={`receive_${item.id}`} aria-label={`Quantidade recebida de ${item.product}`}/></td>
                </tr>)}</tbody>
              </table></div>
            </ActionForm>
          : <div className="table-wrap"><table>
              <thead><tr><th>Produto</th><th className="num">Pedido</th><th className="num">{editable ? "Custo unitário" : "Recebido / NF-e"}</th><th className="num">{editable ? "Total" : "Diferença"}</th>{!editable && <th className="num">Custo</th>}</tr></thead>
              <tbody>{items.rows.map((item) => <tr key={item.id}>
                <td className="cell-wrap"><span className="cell-main"><b>{item.product}</b><small>{item.sku}</small></span></td>
                <td className="num">{item.ordered_quantity}</td>
                {editable
                  ? <><td className="num">{formatMoney(item.unit_cost_cents)}</td><td className="num"><b>{formatMoney(item.ordered_quantity * item.unit_cost_cents)}</b></td></>
                  : <><td className="num">{item.received_quantity}</td><td className={`num ${item.received_quantity - item.ordered_quantity < 0 ? "neg" : ""}`}>{formatSigned(item.received_quantity - item.ordered_quantity)}</td><td className="num">{formatMoney(item.unit_cost_cents)}</td></>}
              </tr>)}</tbody>
            </table></div>}
    </section>
  </div>;
}
