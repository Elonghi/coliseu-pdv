import { ChevronDown, History } from "lucide-react";
import { FilterBar, SearchField } from "@/components/filter-bar";
import { Badge, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { pool } from "@/db";
import { formatDateTime } from "@/lib/format";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; action?: string; page?: string }> }) {
  await requirePermission(permissions.AUDIT_VIEW);
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const action = query.action?.trim() ?? "";
  const page = Math.max(1, Number(query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const [logs, total, actions] = await Promise.all([
    pool.query(`SELECT al.*,u.name user_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE ($1='' OR al.entity_id ILIKE $2 OR al.entity_type ILIKE $2 OR COALESCE(u.name,'') ILIKE $2) AND ($3='' OR al.action=$3) ORDER BY al.created_at DESC LIMIT $4 OFFSET $5`, [q, `%${q}%`, action, PAGE_SIZE, offset]),
    pool.query<{ total: number }>(`SELECT count(*)::int total FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE ($1='' OR al.entity_id ILIKE $2 OR al.entity_type ILIKE $2 OR COALESCE(u.name,'') ILIKE $2) AND ($3='' OR al.action=$3)`, [q, `%${q}%`, action]),
    pool.query<{ action: string }>("SELECT DISTINCT action FROM audit_logs ORDER BY action"),
  ]);

  return <div className="section-gap">
    <PageHeader eyebrow="Segurança" title="Auditoria" description="Registro imutável de alterações e operações sensíveis."/>

    <FilterBar clearHref="/admin/audit" hasFilters={Boolean(q || action)}>
      <SearchField defaultValue={q} placeholder="Usuário, entidade ou identificador"/>
      <label className="toolbar-field">Ação<select className="field" name="action" defaultValue={action}><option value="">Todas as ações</option>{actions.rows.map((row) => <option key={row.action}>{row.action}</option>)}</select></label>
    </FilterBar>

    <section className="grid gap-2">
      {logs.rows.map((log) => <details className="card disclosure audit-row" key={log.id}>
        <summary>
          <span className="audit-summary">
            <span className="cell-main"><b>{formatDateTime(log.created_at)}</b><small>{log.user_name ?? "Sistema"}</small></span>
            <Badge tone="info">{log.action}</Badge>
            <span className="cell-main"><b>{log.entity_type}</b><small className="mono truncate-cell">{log.entity_id}</small></span>
          </span>
          <ChevronDown className="disclosure-chevron" size={18}/>
        </summary>
        <div className="grid md:grid-cols-2 gap-3 p-4">
          <div><p className="chip-label mb-1">Antes</p><pre className="code-block">{log.before ? JSON.stringify(log.before, null, 2) : "—"}</pre></div>
          <div><p className="chip-label mb-1">Depois</p><pre className="code-block">{log.after ? JSON.stringify(log.after, null, 2) : "—"}</pre></div>
        </div>
      </details>)}
      {!logs.rowCount && <div className="card"><EmptyState icon={History} title="Nenhum registro encontrado" description="Ajuste a busca ou a ação selecionada."/></div>}
    </section>
    <Pagination pathname="/admin/audit" query={query} page={page} perPage={PAGE_SIZE} total={total.rows[0].total}/>
  </div>;
}
