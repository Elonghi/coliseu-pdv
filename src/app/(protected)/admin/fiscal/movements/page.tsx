import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Download, FileText, PackageOpen } from "lucide-react";
import { pool } from "@/db";
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
  if (!config.cnpj) return <div className="card p-6 notice-error">Configure <b>SEFAZ_CNPJ</b> para separar as notas de entrada e saída da empresa.</div>;

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
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const summary = metrics.rows[0] ?? { total: 0, authorized: 0, complete: 0, value_cents: 0 };
  const counterpartLabel = direction === "ENTRY" ? "Fornecedor" : "Destinatário";

  const exportParams = new URLSearchParams({ direction });
  if (query.from) exportParams.set("from", query.from);
  if (query.to) exportParams.set("to", query.to);

  return <div className="grid gap-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-gray-500 font-bold">MOVIMENTAÇÃO FISCAL</p><h1 className="text-3xl font-black">Notas de entrada e saída</h1><p className="text-gray-500">Documentos separados pela posição do CNPJ da loja na NF-e.</p></div>
      <a className="btn btn-primary" href={`/api/fiscal/export?${exportParams}`}><Download size={17}/>Exportar para contabilidade</a>
    </header>

    <nav className="fiscal-direction-tabs" aria-label="Tipo de movimentação">
      <Link className={direction === "ENTRY" ? "is-active" : ""} href={{ pathname: "/admin/fiscal/movements", query: { ...query, direction: "ENTRY", page: undefined } }}><ArrowDownToLine size={19}/><span><b>Notas de entrada</b><small>Compras e recebimentos</small></span></Link>
      <Link className={direction === "EXIT" ? "is-active" : ""} href={{ pathname: "/admin/fiscal/movements", query: { ...query, direction: "EXIT", page: undefined } }}><ArrowUpFromLine size={19}/><span><b>Notas de saída</b><small>Emissões da empresa</small></span></Link>
    </nav>

    <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <article className="card metric-card"><FileText/><div><small>Documentos</small><strong>{summary.total}</strong></div></article>
      <article className="card metric-card"><PackageOpen/><div><small>XMLs completos</small><strong>{summary.complete}</strong></div></article>
      <article className="card metric-card"><ArrowDownToLine/><div><small>Autorizadas</small><strong>{summary.authorized}</strong></div></article>
      <article className="card metric-card"><span className="metric-currency">R$</span><div><small>Valor autorizado</small><strong>{formatMoney(summary.value_cents)}</strong></div></article>
    </section>

    <form className="card p-4 grid sm:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
      <input type="hidden" name="direction" value={direction}/>
      <label className="label xl:col-span-2">Busca<input className="field" name="q" defaultValue={query.q} placeholder="Chave, número ou empresa"/></label>
      <label className="label">Situação<select className="field" name="status" defaultValue={query.status ?? ""}><option value="">Todas</option><option value="AUTHORIZED">Autorizadas</option><option value="CANCELED">Canceladas</option><option value="DENIED">Denegadas</option><option value="UNKNOWN">Pendentes</option></select></label>
      <label className="label">Emissão de<input className="field" type="date" name="from" defaultValue={query.from}/></label>
      <label className="label">Emissão até<input className="field" type="date" name="to" defaultValue={query.to}/></label>
      <button className="btn btn-primary">Filtrar</button>
    </form>

    <section className="card">
      <div className="p-5 flex flex-wrap justify-between gap-2"><div><h2 className="font-black">{direction === "ENTRY" ? "Entradas" : "Saídas"}</h2><p className="text-sm text-gray-500">{total} documento(s) encontrado(s)</p></div><span className="badge badge-warn">CNPJ {formatFiscalDocument(config.cnpj)}</span></div>
      <div className="table-wrap"><table><thead><tr><th>Emissão</th><th>Nota</th><th>{counterpartLabel}</th><th>Valor</th><th>Situação</th><th>Documento</th><th></th></tr></thead><tbody>
        {invoices.rows.map((invoice) => {
          const name = direction === "ENTRY" ? invoice.issuer_name : invoice.recipient_name;
          const document = direction === "ENTRY" ? invoice.issuer_cnpj_cpf : invoice.recipient_cnpj_cpf;
          return <tr key={invoice.id}><td>{invoice.issue_at?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "—"}</td><td><b>{invoice.number ?? "—"}</b><small className="block text-gray-500">Série {invoice.series ?? "—"}</small></td><td><b>{name ?? "Não identificado"}</b><small className="block text-gray-500">{formatFiscalDocument(document)}</small></td><td className="font-bold">{invoice.total_cents === null ? "—" : formatMoney(invoice.total_cents)}</td><td><span className={`badge ${invoice.status === "AUTHORIZED" ? "badge-ok" : invoice.status === "CANCELED" ? "badge-danger" : "badge-warn"}`}>{statuses[invoice.status] ?? invoice.status}</span></td><td>{invoice.has_full_xml ? <span className="badge badge-ok">XML completo</span> : <span className="badge badge-warn">Resumo</span>}</td><td><div className="flex gap-2"><Link className="font-bold text-blue-700" href={`/admin/fiscal/${invoice.id}`}>Detalhes</Link>{invoice.has_full_xml && <a className="font-bold text-blue-700" href={`/api/fiscal/invoices/${invoice.id}/pdf`}>PDF</a>}</div></td></tr>;
        })}
        {!invoices.rowCount && <tr><td colSpan={7}>Nenhuma nota de {direction === "ENTRY" ? "entrada" : "saída"} encontrada.</td></tr>}
      </tbody></table></div>
    </section>

    {totalPages > 1 && <nav className="flex justify-center gap-2"><Link className="btn btn-ghost" aria-disabled={page <= 1} href={{ pathname: "/admin/fiscal/movements", query: { ...query, direction, page: String(Math.max(1, page - 1)) } }}>Anterior</Link><span className="p-2">Página {page} de {totalPages}</span><Link className="btn btn-ghost" aria-disabled={page >= totalPages} href={{ pathname: "/admin/fiscal/movements", query: { ...query, direction, page: String(Math.min(totalPages, page + 1)) } }}>Próxima</Link></nav>}
  </div>;
}
