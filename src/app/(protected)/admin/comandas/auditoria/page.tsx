import { ShieldCheck, Store } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { ComandaTabs } from "@/components/comandas/comanda-tabs";
import { Badge, DateTimeCell, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { pool } from "@/db";
import { requireUser } from "@/modules/auth/session";
import { comandaEventTypes } from "@/modules/comandas/audit";
import { eventLabel, reasonLabel } from "@/modules/comandas/labels";
import { listComandaEvents } from "@/modules/comandas/service";

export const dynamic = "force-dynamic";
const PER_PAGE = 40;

export default async function ComandaAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("ADMIN");
  const header = <PageHeader eyebrow="Operação" title="Auditoria das comandas" description="Quem fez o quê, quando e de onde: aberturas, pedidos, cancelamentos e acessos barrados. IP e posição exata são apagados após 90 dias."/>;
  if (user.consolidated) return <div className="section-gap">{header}<ComandaTabs active="auditoria" isAdmin/><EmptyState icon={Store} title="Escolha uma loja" description="A auditoria é de cada loja. Escolha a loja no seletor do menu."/></div>;
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const type = comandaEventTypes.find((value) => value === query.type);
  const outcome = ["OK", "BLOCKED", "FAILED"].includes(query.outcome ?? "") ? query.outcome : undefined;
  const comandaId = /^[0-9a-f-]{36}$/i.test(query.comanda ?? "") ? query.comanda : undefined;
  const [events, comandas] = await Promise.all([
    listComandaEvents({ type, outcome, comandaId, from: query.from || undefined, to: query.to || undefined }, page, PER_PAGE),
    pool.query<{ id: string; number: number }>("SELECT id,number FROM comandas ORDER BY number"),
  ]);
  const total = events[0]?.total_count ?? 0;
  const hasFilters = Boolean(type || outcome || comandaId || query.from || query.to);

  return <div className="section-gap">
    {header}
    <ComandaTabs active="auditoria" isAdmin/>
    <FilterBar clearHref="/admin/comandas/auditoria" hasFilters={hasFilters}>
      <label className="toolbar-field">Evento<select className="field" name="type" defaultValue={type ?? ""}><option value="">Todos</option>{comandaEventTypes.map((value) => <option key={value} value={value}>{eventLabel[value]}</option>)}</select></label>
      <label className="toolbar-field">Resultado<select className="field" name="outcome" defaultValue={outcome ?? ""}><option value="">Todos</option><option value="OK">Ok</option><option value="BLOCKED">Barrado</option></select></label>
      <label className="toolbar-field">Comanda<select className="field" name="comanda" defaultValue={comandaId ?? ""}><option value="">Todas</option>{comandas.rows.map((row) => <option key={row.id} value={row.id}>{row.number}</option>)}</select></label>
      <label className="toolbar-field">De<input className="field" type="date" name="from" defaultValue={query.from}/></label>
      <label className="toolbar-field">Até<input className="field" type="date" name="to" defaultValue={query.to}/></label>
    </FilterBar>
    <section className="card">
      <div className="panel-head"><h2 className="panel-title">{total} registro(s)</h2><ShieldCheck size={18}/></div>
      {events.length ? <div className="table-wrap"><table>
        <thead><tr><th>Quando</th><th>Evento</th><th>Comanda</th><th>Quem</th><th>IP</th><th>Aparelho</th><th>Localização</th><th>Resultado</th></tr></thead>
        <tbody>{events.map((event) => {
          const info = event.device_info ?? {};
          const reason = typeof event.details?.reason === "string" ? event.details.reason : null;
          return <tr key={event.id}>
            <td><DateTimeCell value={event.created_at}/></td>
            <td className="cell-wrap">{eventLabel[event.type as keyof typeof eventLabel] ?? event.type}{reason && <small className="block muted">{reasonLabel[reason] ?? reason}</small>}</td>
            <td>{event.number ?? "—"}</td>
            <td className="cell-wrap">{event.actor_name ?? <span className="muted">Cliente</span>}</td>
            <td className="mono">{event.ip ?? "—"}{event.anonymized_at && <small className="block muted">anonimizado</small>}</td>
            <td className="cell-wrap">{[info.model, info.os, info.browser].filter(Boolean).join(" · ") || "—"}</td>
            <td className="cell-wrap">{event.distance_meters !== null ? `${event.distance_meters} m${event.accuracy_meters ? ` (±${Math.round(event.accuracy_meters)} m)` : ""}` : "—"}{event.latitude !== null && <small className="block muted mono">{event.latitude.toFixed(4)}, {event.longitude?.toFixed(4)}</small>}</td>
            <td><Badge tone={event.outcome === "OK" ? "ok" : "danger"} dot>{event.outcome === "OK" ? "Ok" : "Barrado"}</Badge></td>
          </tr>;
        })}</tbody></table></div> : <EmptyState title="Nenhum registro" description={hasFilters ? "Nenhum registro corresponde aos filtros." : "Os registros aparecem aqui conforme as comandas forem usadas."}/>}
    </section>
    <Pagination pathname="/admin/comandas/auditoria" query={query} page={page} perPage={PER_PAGE} total={total}/>
  </div>;
}
