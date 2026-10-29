import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { Badge, Chips, DateTimeCell, EmptyState, PageHeader, type Tone } from "@/components/ui";
import { pool } from "@/db";
import { queryHref } from "@/lib/query-string";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { inventoryCreateAction } from "@/modules/inventory/actions";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, { label: string; tone: Tone }> = { OPEN: { label: "Aberto", tone: "info" }, FINALIZED: { label: "Finalizado", tone: "ok" }, CANCELED: { label: "Cancelado", tone: "neutral" } };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(permissions.INVENTORY_MANAGE);
  const query = await searchParams;
  const status = query.status && query.status in statusLabel ? query.status : "";
  const counts = await pool.query<{ id: string; name: string; status: string; created_at: Date; creator: string; items: number; counted: number }>(`SELECT c.id,c.name,c.status,c.created_at,c.finalized_at,u.name creator,count(i.id)::int items,count(i.counted_quantity)::int counted FROM inventory_counts c JOIN users u ON u.id=c.created_by_id LEFT JOIN inventory_count_items i ON i.count_id=c.id GROUP BY c.id,u.name ORDER BY c.created_at DESC`);
  const rows = status ? counts.rows.filter((row) => row.status === status) : counts.rows;
  const total = (value: string) => counts.rows.filter((row) => row.status === value).length;

  return <div className="section-gap">
    <PageHeader
      eyebrow="Estoque"
      title="Inventários"
      description="Conferência física com rastreio das divergências e ajustes."
      actions={<Modal trigger={<><Plus size={16}/>Novo inventário</>} triggerClassName="btn btn-success" size="sm" title="Iniciar inventário" description="Todos os produtos entram na contagem com o saldo atual do sistema.">
        <ActionForm action={inventoryCreateAction} submitLabel="Iniciar inventário" className="grid gap-4">
          <label className="label">Nome<input className="field" name="name" placeholder="Ex.: Contagem mensal outubro" required/></label>
          <label className="label">Observação<textarea className="field" name="notes"/></label>
        </ActionForm>
      </Modal>}
    />

    <div className="chip-row"><Chips label="Situação" items={[
      { label: "Todos", href: queryHref("/admin/inventory", query, { status: null }), active: !status, count: counts.rowCount ?? 0 },
      { label: "Abertos", href: queryHref("/admin/inventory", query, { status: "OPEN" }), active: status === "OPEN", count: total("OPEN") },
      { label: "Finalizados", href: queryHref("/admin/inventory", query, { status: "FINALIZED" }), active: status === "FINALIZED", count: total("FINALIZED") },
      { label: "Cancelados", href: queryHref("/admin/inventory", query, { status: "CANCELED" }), active: status === "CANCELED", count: total("CANCELED") },
    ]}/></div>

    <section className="card">
      {rows.length ? <div className="table-wrap"><table>
        <thead><tr><th>Inventário</th><th>Status</th><th>Progresso</th><th>Responsável</th><th>Criado em</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{rows.map((row) => {
          const info = statusLabel[row.status] ?? { label: row.status, tone: "neutral" as Tone };
          const percent = row.items ? Math.round((row.counted / row.items) * 100) : 0;
          return <tr key={row.id}>
            <td className="cell-wrap"><Link className="link-row" href={`/admin/inventory/${row.id}`}>{row.name}</Link></td>
            <td><Badge tone={info.tone} dot>{info.label}</Badge></td>
            <td><div className="grid gap-1 min-w-40"><div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }}/></div><small className="muted">{row.counted}/{row.items} contados</small></div></td>
            <td>{row.creator}</td>
            <td><DateTimeCell value={row.created_at}/></td>
            <td className="col-actions"><Link className="btn btn-ghost btn-sm" href={`/admin/inventory/${row.id}`}>{row.status === "OPEN" ? "Continuar" : "Abrir"}</Link></td>
          </tr>;
        })}</tbody>
      </table></div> : <EmptyState icon={ClipboardCheck} title="Nenhum inventário" description={status ? "Nenhum inventário com esta situação." : "Inicie uma contagem para conferir o estoque físico."}/>}
    </section>
  </div>;
}
