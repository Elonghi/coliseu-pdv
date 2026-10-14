import Link from "next/link";
import { pool } from "@/db";
import { formatMoney, saleNumber } from "@/lib/money";
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
  const [sales, total, operators, methods] = await Promise.all([
    pool.query(`SELECT s.id,s.created_at,s.total_cents,s.status,u.name operator,string_agg(pm.name,', ' ORDER BY pm.sort_order) payments
      FROM sales s JOIN users u ON u.id=s.operator_id JOIN payments p ON p.sale_id=s.id JOIN payment_methods pm ON pm.code=p.method_code
      ${clause} GROUP BY s.id,u.name ORDER BY s.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, listValues),
    pool.query<{ total: number }>(`SELECT count(*)::int total FROM sales s ${clause}`, values),
    user.role === "ADMIN" ? pool.query("SELECT id,name FROM users ORDER BY name") : Promise.resolve({ rows: [] }),
    pool.query("SELECT code,name FROM payment_methods ORDER BY sort_order"),
  ]);
  const pages = Math.max(1, Math.ceil(total.rows[0].total / PAGE_SIZE));
  const pageQuery = (target: number) => ({ ...query, page: String(target) });

  return <div className="grid gap-5">
    <header><p className="text-sm text-gray-500 font-bold">RELATÓRIOS</p><h1 className="text-3xl font-black">Vendas</h1>{user.role !== "ADMIN" && <p className="text-gray-500">Exibindo somente as suas vendas.</p>}</header>
    <form className="card p-4 grid sm:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
      <label className="label">De<input className="field" type="date" name="from" defaultValue={query.from}/></label>
      <label className="label">Até<input className="field" type="date" name="to" defaultValue={query.to}/></label>
      {user.role === "ADMIN" && <label className="label">Operador<select className="field" name="operator" defaultValue={query.operator ?? ""}><option value="">Todos</option>{operators.rows.map((operator) => <option value={operator.id} key={operator.id}>{operator.name}</option>)}</select></label>}
      <label className="label">Pagamento<select className="field" name="payment" defaultValue={query.payment ?? ""}><option value="">Todos</option>{methods.rows.map((method) => <option value={method.code} key={method.code}>{method.name}</option>)}</select></label>
      <label className="label">Status<select className="field" name="status" defaultValue={query.status ?? ""}><option value="">Todos</option><option value="CONFIRMED">Confirmada</option><option value="CANCELED">Cancelada</option></select></label>
      <button className="btn btn-primary">Filtrar</button>
    </form>
    <section className="card table-wrap"><table><thead><tr><th>Número</th><th>Data</th><th>Operador</th><th>Pagamento</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>{sales.rows.map((sale) => <tr key={sale.id}><td className="font-bold">{saleNumber(sale.id)}</td><td>{new Date(sale.created_at).toLocaleString("pt-BR")}</td><td>{sale.operator}</td><td>{sale.payments}</td><td>{formatMoney(sale.total_cents)}</td><td><span className={`badge ${sale.status === "CONFIRMED" ? "badge-ok" : "badge-danger"}`}>{sale.status === "CONFIRMED" ? "Confirmada" : "Cancelada"}</span></td><td><Link className="font-bold text-blue-700" href={`/admin/sales/${sale.id}`}>Detalhes</Link></td></tr>)}</tbody></table></section>
    <nav className="flex justify-center items-center gap-3"><Link className="btn btn-ghost" href={{ query: pageQuery(Math.max(1, page - 1)) }}>Anterior</Link><span>{page}/{pages}</span><Link className="btn btn-ghost" href={{ query: pageQuery(Math.min(pages, page + 1)) }}>Próxima</Link></nav>
  </div>;
}
