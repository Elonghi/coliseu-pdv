import { notFound } from "next/navigation";
import { CheckCheck, Search, XCircle } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { FilterBar, SearchField } from "@/components/filter-bar";
import { Modal } from "@/components/modal";
import { Badge, Chips, EmptyState, PageHeader, StatCard, type Tone } from "@/components/ui";
import { pool } from "@/db";
import { formatSigned } from "@/lib/format";
import { queryHref } from "@/lib/query-string";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import {
  inventoryCancelAction,
  inventoryFinalizeAction,
  inventoryItemAction,
} from "@/modules/inventory/actions";

export const dynamic = "force-dynamic";

type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  expected_quantity: number;
  counted_quantity: number | null;
  notes: string | null;
};

const statusInfo: Record<string, { label: string; tone: Tone }> = { OPEN: { label: "Aberto", tone: "info" }, FINALIZED: { label: "Finalizado", tone: "ok" }, CANCELED: { label: "Cancelado", tone: "neutral" } };

export default async function InventoryDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(permissions.INVENTORY_MANAGE);
  const { id } = await params;
  const query = await searchParams;
  const [count, items] = await Promise.all([
    pool.query("SELECT id,name,status,notes,created_at,finalized_at FROM inventory_counts WHERE id=$1", [id]),
    pool.query<InventoryItem>(`SELECT i.id,p.sku,p.name,i.expected_quantity,i.counted_quantity,i.notes
      FROM inventory_count_items i JOIN products p ON p.id=i.product_id
      WHERE i.count_id=$1 ORDER BY p.name`, [id]),
  ]);
  if (!count.rows[0]) notFound();
  const data = count.rows[0];
  const open = data.status === "OPEN";
  const info = statusInfo[data.status] ?? { label: data.status, tone: "neutral" as Tone };

  const total = items.rowCount ?? 0;
  const counted = items.rows.filter((row) => row.counted_quantity !== null).length;
  const divergent = items.rows.filter((row) => row.counted_quantity !== null && row.counted_quantity !== row.expected_quantity).length;
  const percent = total ? Math.round((counted / total) * 100) : 0;
  const filter = query.filter === "pending" || query.filter === "diff" ? query.filter : "";
  const q = query.q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const visible = items.rows.filter((row) =>
    (!q || row.name.toLocaleLowerCase("pt-BR").includes(q) || row.sku.toLocaleLowerCase("pt-BR").includes(q))
    && (filter === "" || (filter === "pending" && row.counted_quantity === null) || (filter === "diff" && row.counted_quantity !== null && row.counted_quantity !== row.expected_quantity)));
  const base = `/admin/inventory/${id}`;

  return <div className="section-gap">
    <PageHeader
      back={{ href: "/admin/inventory", label: "Inventários" }}
      eyebrow="Inventário"
      title={data.name}
      description={data.notes || undefined}
      actions={<>
        <Badge tone={info.tone} dot>{info.label}</Badge>
        {open && <>
          <Modal trigger={<><XCircle size={15}/>Cancelar inventário</>} triggerClassName="btn btn-danger" size="sm" title="Cancelar inventário" description="O inventário é encerrado sem ajustar o estoque. O motivo fica registrado nas observações.">
            <ActionForm action={inventoryCancelAction} submitLabel="Cancelar inventário" submitVariant="danger-solid" className="grid gap-4">
              <input type="hidden" name="countId" value={id}/>
              <label className="label">Motivo<input className="field" name="reason" minLength={5} required/></label>
            </ActionForm>
          </Modal>
          <Modal trigger={<><CheckCheck size={15}/>Finalizar e ajustar estoque</>} triggerClassName="btn btn-primary" size="sm" title="Finalizar inventário" description="Todos os produtos precisam estar contados. A finalização é transacional: ou ajusta tudo, ou nada.">
            <ActionForm action={inventoryFinalizeAction} submitLabel="Finalizar e ajustar estoque" className="grid gap-4">
              <input type="hidden" name="countId" value={id}/>
              <p className="notice-info">{counted}/{total} produto(s) contado(s) · {divergent} divergência(s) serão ajustadas no estoque.</p>
            </ActionForm>
          </Modal>
        </>}
      </>}
    />

    <section className="stat-grid" aria-label="Andamento da contagem">
      <article className="card stat"><span className="stat-body"><span className="stat-label">Progresso</span><strong className="stat-value">{counted}/{total} contados</strong><span className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }}/></span></span></article>
      <StatCard tone={total - counted ? "warn" : "ok"} icon={Search} label="Pendentes" value={total - counted} hint={total - counted ? "Ainda sem contagem" : "Tudo contado"}/>
      <StatCard tone={divergent ? "danger" : undefined} icon={XCircle} label="Divergências" value={divergent} hint="Contagem diferente do sistema"/>
    </section>

    <FilterBar clearHref={base} hasFilters={Boolean(q || filter)}>
      <SearchField defaultValue={query.q} placeholder="Nome ou SKU do produto"/>
      <Chips label="Mostrar" items={[
        { label: "Todos", href: queryHref(base, query, { filter: null }), active: !filter, count: total },
        { label: "Pendentes", href: queryHref(base, query, { filter: "pending" }), active: filter === "pending", count: total - counted, tone: total - counted ? "warn" : undefined },
        { label: "Divergentes", href: queryHref(base, query, { filter: "diff" }), active: filter === "diff", count: divergent, tone: divergent ? "danger" : undefined },
      ]}/>
    </FilterBar>

    <section className="card">
      {visible.length ? <>
        <div className={`hidden md:grid gap-3 px-5 py-2 text-xs font-bold uppercase muted border-b border-gray-200 ${open ? "md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_96px]" : "md:grid-cols-[minmax(0,1fr)_110px_110px_110px_minmax(0,1fr)]"}`}>
          <span>Produto</span>{open ? <><span>Contado</span><span>Observação</span><span/></> : <><span>Sistema</span><span>Contado</span><span>Diferença</span><span>Observação</span></>}
        </div>
        {visible.map((item) => {
          const difference = item.counted_quantity === null ? null : item.counted_quantity - item.expected_quantity;
          return open
            ? <ActionForm key={item.id} action={inventoryItemAction} inline submitLabel="Salvar" submitVariant={item.counted_quantity === null ? "primary" : "ghost"} className="row-form grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_96px]">
              <input type="hidden" name="countId" value={id}/>
              <input type="hidden" name="itemId" value={item.id}/>
              <span className="cell-main"><b>{item.name}</b><small>{item.sku} · Sistema: {item.expected_quantity}{difference !== null && difference !== 0 && <> · <b className={difference > 0 ? "pos" : "neg"}>{formatSigned(difference)}</b></>}</small></span>
              <input className="field" type="number" min="0" name="countedQuantity" defaultValue={item.counted_quantity ?? ""} placeholder="Contado" aria-label={`Quantidade contada de ${item.name}`} required/>
              <input className="field" name="notes" defaultValue={item.notes ?? ""} placeholder="Observação (opcional)" aria-label={`Observação sobre ${item.name}`}/>
            </ActionForm>
            : <article key={item.id} className="row-form grid-cols-2 md:grid-cols-[minmax(0,1fr)_110px_110px_110px_minmax(0,1fr)]">
              <span className="cell-main col-span-2 md:col-span-1"><b>{item.name}</b><small>{item.sku}</small></span>
              <span>{item.expected_quantity}</span>
              <span>{item.counted_quantity ?? "—"}</span>
              <span>{difference === null ? "—" : <Badge tone={difference === 0 ? "ok" : "danger"}>{difference === 0 ? "Sem diferença" : formatSigned(difference)}</Badge>}</span>
              <span className="muted col-span-2 md:col-span-1">{item.notes || "—"}</span>
            </article>;
        })}
      </> : <EmptyState icon={Search} title="Nenhum produto encontrado" description="Ajuste a busca ou o filtro selecionado."/>}
    </section>
  </div>;
}
