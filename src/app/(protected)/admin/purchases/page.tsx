import Link from "next/link";
import { Plus, Truck, UserPlus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { Badge, Chips, EmptyState, PageHeader, type Tone } from "@/components/ui";
import { pool } from "@/db";
import { formatDueDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { purchaseStatus } from "@/lib/purchase-status";
import { queryHref } from "@/lib/query-string";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { purchaseCreateAction, supplierCreateAction } from "@/modules/purchases/actions";

export const dynamic = "force-dynamic";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(permissions.PURCHASE_MANAGE);
  const query = await searchParams;
  const status = query.status && query.status in purchaseStatus ? query.status : "";
  const [suppliers, orders] = await Promise.all([
    pool.query<{ id: string; name: string; document: string | null }>("SELECT id,name,document FROM suppliers WHERE active=true ORDER BY name"),
    pool.query<{ id: string; number: number; status: string; expected_at: Date | null; supplier: string; total_cents: number }>(`SELECT po.id,po.number,po.status,po.expected_at,po.created_at,s.name supplier,COALESCE(sum(poi.ordered_quantity*poi.unit_cost_cents),0)::int total_cents FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id LEFT JOIN purchase_order_items poi ON poi.order_id=po.id GROUP BY po.id,s.name ORDER BY po.created_at DESC`),
  ]);
  const rows = status ? orders.rows.filter((row) => row.status === status) : orders.rows;
  const total = (value: string) => orders.rows.filter((row) => row.status === value).length;

  return <div className="section-gap">
    <PageHeader
      eyebrow="Compras"
      title="Pedidos de compra"
      description="Do pedido ao fornecedor à conferência da NF-e e do estoque."
      actions={<>
        <Modal trigger={<><UserPlus size={16}/>Novo fornecedor</>} size="sm" title="Novo fornecedor" description="Cadastre quem fornece os produtos para poder criar pedidos de compra.">
          <ActionForm action={supplierCreateAction} submitLabel="Cadastrar fornecedor" className="grid gap-4">
            <label className="label">Nome<input className="field" name="name" required/></label>
            <label className="label">CNPJ<input className="field" name="document" inputMode="numeric"/></label>
            <label className="label">E-mail<input className="field" type="email" name="email"/></label>
            <label className="label">Telefone<input className="field" name="phone" inputMode="tel"/></label>
          </ActionForm>
        </Modal>
        <Modal trigger={<><Plus size={16}/>Novo pedido</>} triggerClassName="btn btn-success" size="sm" title="Novo pedido" description="O pedido começa como rascunho; adicione os itens na próxima tela.">
          {suppliers.rowCount
            ? <ActionForm action={purchaseCreateAction} submitLabel="Criar pedido" className="grid gap-4">
                <label className="label">Fornecedor<select className="field" name="supplierId">{suppliers.rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                <label className="label">Previsão de entrega<input className="field" type="date" name="expectedAt"/></label>
                <label className="label">Observação<textarea className="field" name="notes"/></label>
              </ActionForm>
            : <p className="notice-warn">Cadastre um fornecedor antes de criar um pedido.</p>}
        </Modal>
      </>}
    />

    <div className="chip-row"><Chips label="Situação" items={[
      { label: "Todos", href: queryHref("/admin/purchases", query, { status: null }), active: !status, count: orders.rowCount ?? 0 },
      ...Object.entries(purchaseStatus).map(([value, info]) => ({ label: info.label, href: queryHref("/admin/purchases", query, { status: value }), active: status === value, count: total(value) })),
    ]}/></div>

    <section className="card">
      {rows.length ? <div className="table-wrap"><table>
        <thead><tr><th>Pedido</th><th>Fornecedor</th><th>Status</th><th>Previsão</th><th className="num">Total</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{rows.map((row) => {
          const info = purchaseStatus[row.status] ?? { label: row.status, tone: "neutral" as Tone };
          return <tr key={row.id}>
            <td><Link className="link-row mono" href={`/admin/purchases/${row.id}`}>PC-{String(row.number).padStart(6, "0")}</Link></td>
            <td className="cell-wrap"><b>{row.supplier}</b></td>
            <td><Badge tone={info.tone} dot>{info.label}</Badge></td>
            <td>{formatDueDate(row.expected_at)}</td>
            <td className="num"><b>{formatMoney(row.total_cents)}</b></td>
            <td className="col-actions"><Link className="btn btn-ghost btn-sm" href={`/admin/purchases/${row.id}`}>Abrir</Link></td>
          </tr>;
        })}</tbody>
      </table></div> : <EmptyState icon={Truck} title="Nenhum pedido de compra" description={status ? "Nenhum pedido com esta situação." : "Crie um pedido para acompanhar a compra até o recebimento."}/>}
    </section>
  </div>;
}
