import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Download, FileSearch, FileText, PackageOpen, Wallet } from "lucide-react";
import { FilterBar, SearchField } from "@/components/filter-bar";
import { Badge, EmptyState, PageHeader, Pagination, StatCard } from "@/components/ui";
import { pool } from "@/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { sefazPublicConfig } from "@/modules/fiscal/config";
import { formatFiscalDocument } from "@/modules/fiscal/direction";

export const dynamic = "force-dynamic";

type Direction = "ENTRY" | "EXIT";
type InvoiceRow = {
  id: string; access_key: string; has_full_xml: boolean; status: string; issue_at: Date | null;
  model: string | null; series: string | null; number: string | null; total_cents: number | null;
  issuer_name: string | null; issuer_cnpj_cpf: string | null; recipient_name: string | null; recipient_cnpj_cpf: string | null;
};

const statuses: Record<string, string> = { AUTHORIZED: "Autorizada", CANCELED: "Cancelada", DENIED: "Denegada", UNKNOWN: "Pendente" };

export default async function FiscalMovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const config = sefazPublicConfig();
  const direction: Direction = query.direction === "EXIT" ? "EXIT" : "ENTRY";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const perPage = 40;
  if (!config.cnpj) return <div className="section-gap"><PageHeader eyebrow="Movimentação fiscal" title="Notas de entrada e saída"/><p className="notice-warn">Configure <b>SEFAZ_CNPJ</b> para separar as notas de entrada e saída da empresa.</p></div>;

  const values: unknown[] = [config.cnpj];
  const directionCondition = direction === "ENTRY" ? "(f.recipient_cnpj_cpf=$1 OR (f.recipient_cnpj_cpf IS NULL AND f.issuer_cnpj_cpf IS DISTINCT FROM $1))" : "f.issuer_cnpj_cpf=$1";
  const where = [directionCondition];
  if (query.q?.trim()) { values.push(`%${query.q.trim()}%`); where.push(`(f.access_key ILIKE $${values.length} OR f.number ILIKE $${values.length} OR f.issuer_name ILIKE $${values.length} OR f.recipient_name ILIKE $${values.length})`); }
  if (["AUTHORIZED", "CANCELED", "DENIED", "UNKNOWN"].includes(query.status ?? "")) { values.push(query.status); where.push(`f.status=$${values.length}`); }
  if (query.from) { values.push(query.from); where.push(`f.issue_at >= $${values.length}::date`); }
  if (query.to) { values.push(query.to); where.push(`f.issue_at < $${values.length}::date + interval '1 day'`); }
  const condition = `WHERE ${where.join(" AND ")}`;

  const [invoices, count, metrics] = await Promise.all([
    pool.query<InvoiceRow>(`SELECT f.id,f.access_key,f.has_full_xml,f.status,f.issue_at,f.model,f.series,f.number,f.total_cents::float8 AS total_cents,f.issuer_name,f.issuer_cnpj_cpf,f.recipient_name,f.recipient_cnpj_cpf FROM fiscal_invoices f ${condition} ORDER BY f.issue_at DESC NULLS LAST,f.created_at DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`, values),
    pool.query<{ total: number }>(`SELECT count(*)::int total FROM fiscal_invoices f ${condition}`, values),
    pool.query<{ total: number; authorized: number; complete: number; value_cents: number }>(`SELECT count(*)::int total,count(*) FILTER (WHERE f.status='AUTHORIZED')::int authorized,count(*) FILTER (WHERE f.has_full_xml)::int complete,COALESCE(sum(f.total_cents) FILTER (WHERE f.status='AUTHORIZED'),0)::float8 value_cents FROM fiscal_invoices f ${condition}`, values),
  ]);
  const total = count.rows[0]?.total ?? 0;
  const summary = metrics.rows[0] ?? { total: 0, authorized: 0, complete: 0, value_cents: 0 };
  const counterpartLabel = direction === "ENTRY" ? "Fornecedor" : "Destinatário";

  const exportParams = new URLSearchParams({ direction });
  if (query.from) exportParams.set("from", query.from);
  if (query.to) exportParams.set("to", query.to);

  const hasFilters = Boolean(query.q?.trim() || query.status || query.from || query.to);

  return <div className="section-gap">
    <PageHeader
      eyebrow="Movimentação fiscal"
      title="Notas de entrada e saída"
      description="Documentos separados pela posição do CNPJ da loja na NF-e."
      actions={<a className="btn btn-primary" href={`/api/fiscal/export?${exportParams}`}><Download size={16}/>Exportar para contabilidade</a>}
    />

    <nav className="fiscal-direction-tabs" aria-label="Tipo de movimentação">
      <Link className={direction === "ENTRY" ? "is-active" : ""} href={{ pathname: "/admin/fiscal/movements", query: { ...query, direction: "ENTRY", page: undefined } }}><ArrowDownToLine size={19}/><span><b>Notas de entrada</b><small>Compras e recebimentos</small></span></Link>
      <Link className={direction === "EXIT" ? "is-active" : ""} href={{ pathname: "/admin/fiscal/movements", query: { ...query, direction: "EXIT", page: undefined } }}><ArrowUpFromLine size={19}/><span><b>Notas de saída</b><small>Emissões da empresa</small></span></Link>
    </nav>

    <section className="stat-grid" aria-label="Resumo fiscal">
      <StatCard icon={FileText} label="Documentos" value={summary.total}/>
      <StatCard icon={PackageOpen} label="XMLs completos" value={summary.complete}/>
      <StatCard tone="ok" icon={CheckCircle2} label="Autorizadas" value={summary.authorized}/>
      <StatCard tone="info" icon={Wallet} label="Valor autorizado" value={formatMoney(summary.value_cents)}/>
    </section>

    <FilterBar clearHref={`/admin/fiscal/movements?direction=${direction}`} hasFilters={hasFilters}>
      <input type="hidden" name="direction" value={direction}/>
      <SearchField defaultValue={query.q} placeholder="Chave, número ou empresa"/>
      <label className="toolbar-field">Situação<select className="field" name="status" defaultValue={query.status ?? ""}><option value="">Todas</option><option value="AUTHORIZED">Autorizadas</option><option value="CANCELED">Canceladas</option><option value="DENIED">Denegadas</option><option value="UNKNOWN">Pendentes</option></select></label>
      <label className="toolbar-field">Emissão de<input className="field" type="date" name="from" defaultValue={query.from}/></label>
      <label className="toolbar-field">Emissão até<input className="field" type="date" name="to" defaultValue={query.to}/></label>
    </FilterBar>

    <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">{direction === "ENTRY" ? "Entradas" : "Saídas"}</h2><p className="panel-desc">{total} documento(s) encontrado(s)</p></div><Badge tone="info">CNPJ {formatFiscalDocument(config.cnpj)}</Badge></div>
      {invoices.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Emissão</th><th>Nota</th><th>{counterpartLabel}</th><th className="num">Valor</th><th>Situação</th><th>Documento</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {invoices.rows.map((invoice) => {
            const name = direction === "ENTRY" ? invoice.issuer_name : invoice.recipient_name;
            const document = direction === "ENTRY" ? invoice.issuer_cnpj_cpf : invoice.recipient_cnpj_cpf;
            return <tr key={invoice.id}>
              <td>{formatDate(invoice.issue_at)}</td>
              <td><span className="cell-main"><b>{invoice.number ?? "—"}</b><small>Série {invoice.series ?? "—"}</small></span></td>
              <td className="cell-wrap"><span className="cell-main"><b>{name ?? "Não identificado"}</b><small>{formatFiscalDocument(document)}</small></span></td>
              <td className="num"><b>{invoice.total_cents === null ? "—" : formatMoney(invoice.total_cents)}</b></td>
              <td><Badge tone={invoice.status === "AUTHORIZED" ? "ok" : invoice.status === "CANCELED" ? "danger" : "warn"} dot>{statuses[invoice.status] ?? invoice.status}</Badge></td>
              <td>{invoice.has_full_xml ? <Badge tone="ok">XML completo</Badge> : <Badge tone="warn">Resumo</Badge>}</td>
              <td className="col-actions"><div className="row-actions"><Link className="btn btn-ghost btn-sm" href={`/admin/fiscal/${invoice.id}`}>Detalhes</Link>{invoice.has_full_xml && <a className="btn btn-ghost btn-sm" href={`/api/fiscal/invoices/${invoice.id}/pdf`}>PDF</a>}</div></td>
            </tr>;
          })}
        </tbody>
      </table></div> : <EmptyState icon={FileSearch} title={`Nenhuma nota de ${direction === "ENTRY" ? "entrada" : "saída"} encontrada`} description={hasFilters ? "Nenhuma nota corresponde aos filtros aplicados." : "As notas aparecem aqui depois da sincronização com a SEFAZ ou da importação de XMLs."}/>}
    </section>

    <Pagination pathname="/admin/fiscal/movements" query={{ ...query, direction }} page={page} perPage={perPage} total={total}/>
  </div>;
}
