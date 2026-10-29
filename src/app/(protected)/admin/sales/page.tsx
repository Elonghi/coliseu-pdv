import Link from "next/link";
import { Ban, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Chips, DateTimeCell, EmptyState, PageHeader, Pagination, StatCard } from "@/components/ui";
import { pool } from "@/db";
import { formatMoney, saleNumber } from "@/lib/money";
import { queryHref, todayInSaoPaulo } from "@/lib/query-string";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission(permissions.SALES_VIEW);
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const values: unknown[] = [];
  const where: string[] = [];
  if (user.role !== "ADMIN") { values.push(user.id); where.push(`s.operator_id=$${values.length}`); }
  if (query.from) { values.push(query.from); where.push(`s.created_at >= $${values.length}::date`); }
  if (query.to) { values.push(query.to); where.push(`s.created_at < $${values.length}::date + interval '1 day'`); }
  if (query.operator && user.role === "ADMIN") { values.push(query.operator); where.push(`s.operator_id=$${values.length}`); }
  if (query.status) { values.push(query.status); where.push(`s.status=$${values.length}`); }
  if (query.payment) { values.push(query.payment); where.push(`EXISTS(SELECT 1 FROM payments px WHERE px.sale_id=s.id AND px.method_code=$${values.length})`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const listValues = [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE];
  const [sales, summary, operators, methods] = await Promise.all([
    pool.query(`SELECT s.id,s.created_at,s.total_cents,s.status,u.name operator,string_agg(pm.name,', ' ORDER BY pm.sort_order) payments
      FROM sales s JOIN users u ON u.id=s.operator_id JOIN payments p ON p.sale_id=s.id JOIN payment_methods pm ON pm.code=p.method_code
      ${clause} GROUP BY s.id,u.name ORDER BY s.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, listValues),
    pool.query<{ total: number; canceled: number; revenue_cents: number }>(`SELECT count(*)::int total,count(*) FILTER (WHERE s.status='CANCELED')::int canceled,COALESCE(sum(s.total_cents) FILTER (WHERE s.status='CONFIRMED'),0)::float8 revenue_cents FROM sales s ${clause}`, values),
    user.role === "ADMIN" ? pool.query("SELECT id,name FROM users ORDER BY name") : Promise.resolve({ rows: [] }),
    pool.query("SELECT code,name FROM payment_methods ORDER BY sort_order"),
  ]);
  const { total, canceled, revenue_cents: revenue } = summary.rows[0];
  const confirmed = total - canceled;

  const today = todayInSaoPaulo();
  const periods = [
    { label: "Hoje", from: today, to: today },
    { label: "7 dias", from: todayInSaoPaulo(-6), to: today },
    { label: "30 dias", from: todayInSaoPaulo(-29), to: today },
    { label: "Este mês", from: `${today.slice(0, 8)}01`, to: today },
  ];
  const noPeriod = !query.from && !query.to;
  const hasFilters = Boolean(query.from || query.to || query.operator || query.status || query.payment);

  return <div className="section-gap">
    <PageHeader eyebrow="Relatórios" title="Vendas" description={user.role === "ADMIN" ? "Consulte, filtre e cancele vendas realizadas no PDV." : "Exibindo somente as suas vendas."}/>

    <FilterBar clearHref="/admin/sales" hasFilters={hasFilters}>
      <div className="toolbar-row chip-row">
        <Chips label="Período" items={[
          { label: "Todo o histórico", href: queryHref("/admin/sales", query, { from: null, to: null }), active: noPeriod },
          ...periods.map((period) => ({ label: period.label, href: queryHref("/admin/sales", query, { from: period.from, to: period.to }), active: query.from === period.from && query.to === period.to })),
        ]}/>
      </div>
      <label className="toolbar-field">De<input className="field" type="date" name="from" defaultValue={query.from}/></label>
      <label className="toolbar-field">Até<input className="field" type="date" name="to" defaultValue={query.to}/></label>
      {user.role === "ADMIN" && <label className="toolbar-field">Operador<select className="field" name="operator" defaultValue={query.operator ?? ""}><option value="">Todos</option>{operators.rows.map((operator) => <option value={operator.id} key={operator.id}>{operator.name}</option>)}</select></label>}
      <label className="toolbar-field">Pagamento<select className="field" name="payment" defaultValue={query.payment ?? ""}><option value="">Todos</option>{methods.rows.map((method) => <option value={method.code} key={method.code}>{method.name}</option>)}</select></label>
      <label className="toolbar-field">Status<select className="field" name="status" defaultValue={query.status ?? ""}><option value="">Todos</option><option value="CONFIRMED">Confirmada</option><option value="CANCELED">Cancelada</option></select></label>
    </FilterBar>

    <section className="stat-grid" aria-label="Resumo do filtro">
      <StatCard icon={ShoppingBag} label="Vendas no filtro" value={total} hint={`${confirmed} confirmada(s)`}/>
      <StatCard tone="ok" icon={Wallet} label="Faturamento" value={formatMoney(revenue)} hint="Somente vendas confirmadas"/>
      <StatCard icon={TrendingUp} label="Ticket médio" value={formatMoney(confirmed ? Math.round(revenue / confirmed) : 0)} hint="Por venda confirmada"/>
      <StatCard tone={canceled ? "danger" : undefined} icon={Ban} label="Canceladas" value={canceled}/>
    </section>

    <section className="card">
      {sales.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Número</th><th>Data</th><th>Operador</th><th>Pagamento</th><th className="num">Total</th><th>Status</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{sales.rows.map((sale) => <tr key={sale.id}>
          <td><Link className="link-row mono" href={`/admin/sales/${sale.id}`}>{saleNumber(sale.id)}</Link></td>
          <td><DateTimeCell value={sale.created_at}/></td>
          <td>{sale.operator}</td>
          <td><div className="chip-group">{String(sale.payments).split(", ").map((method) => <Badge key={method}>{method}</Badge>)}</div></td>
          <td className="num"><b>{formatMoney(sale.total_cents)}</b></td>
          <td><Badge tone={sale.status === "CONFIRMED" ? "ok" : "danger"} dot>{sale.status === "CONFIRMED" ? "Confirmada" : "Cancelada"}</Badge></td>
          <td className="col-actions"><Link className="btn btn-ghost btn-sm" href={`/admin/sales/${sale.id}`}>Detalhes</Link></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon={Receipt} title="Nenhuma venda encontrada" description={hasFilters ? "Nenhuma venda corresponde aos filtros aplicados." : "As vendas feitas no PDV aparecem aqui."}/>}
    </section>
    <Pagination pathname="/admin/sales" query={query} page={page} perPage={PAGE_SIZE} total={total}/>
  </div>;
}
