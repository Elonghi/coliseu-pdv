import Link from "next/link";
import { AlertTriangle, Banknote, CalendarDays, HandCoins, PackageX, ReceiptText, ShoppingBag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { DashboardCharts } from "@/components/dashboard-charts";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { getDashboard } from "@/modules/dashboard/queries";
import { hasPermission, permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";

export const dynamic = "force-dynamic";

const percent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });

export default async function DashboardPage() {
  const user = await requirePermission(permissions.DASHBOARD_VIEW);
  const data = await getDashboard();
  const { kpis: k, financial: f, stock } = data;
  const change = k.previous_month_cents ? ((k.month_cents - k.previous_month_cents) / k.previous_month_cents) * 100 : null;
  const link = (permission: Parameters<typeof hasPermission>[1], href: string) => hasPermission(user, permission) ? href : undefined;
  const financeLink = (type: string) => link(permissions.FINANCE_MANAGE, `/admin/finance?type=${type}`);

  return <div className="section-gap">
    <PageHeader eyebrow="Visão geral" title="Dashboard" description="Vendas, financeiro e alertas de estoque em um só lugar."/>

    <section className="grid gap-3" aria-label="Vendas">
      <h2 className="page-eyebrow">Vendas</h2>
      <div className="stat-grid">
        <StatCard primary icon={ShoppingBag} label="Hoje" value={formatMoney(k.today_cents)} hint={`${k.today_count} venda(s) confirmada(s)`}/>
        <StatCard icon={CalendarDays} label="Semana" value={formatMoney(k.week_cents)} hint="Desde segunda-feira"/>
        <StatCard
          icon={change !== null && change < 0 ? TrendingDown : TrendingUp}
          label="Mês"
          value={formatMoney(k.month_cents)}
          hint={change === null ? `${k.month_count} venda(s) · Sem base anterior` : `${k.month_count} venda(s) · ${percent.format(change)}% vs. mês anterior`}
          hintTone={change === null ? undefined : change < 0 ? "danger" : "ok"}
        />
        <StatCard icon={ReceiptText} label="Ticket médio" value={formatMoney(k.avg_cents)} hint="Média das vendas do mês"/>
      </div>
    </section>

    <section className="grid gap-3" aria-label="Financeiro">
      <h2 className="page-eyebrow">Financeiro e relacionamento</h2>
      <div className="stat-grid">
        <StatCard tone="ok" icon={Banknote} label="A receber" value={formatMoney(f.receivable_cents)} href={financeLink("RECEIVABLE")} hint={f.overdue_receivable_cents ? `Vencido: ${formatMoney(f.overdue_receivable_cents)}` : "Nada vencido"} hintTone={f.overdue_receivable_cents ? "danger" : undefined}/>
        <StatCard tone="danger" icon={Wallet} label="A pagar" value={formatMoney(f.payable_cents)} href={financeLink("PAYABLE")} hint={f.overdue_payable_cents ? `Vencido: ${formatMoney(f.overdue_payable_cents)}` : "Nada vencido"} hintTone={f.overdue_payable_cents ? "danger" : undefined}/>
        <StatCard tone="info" icon={HandCoins} label="Créditos de jogadores" value={formatMoney(f.player_credit_cents)} href={link(permissions.PLAYERS_MANAGE, "/admin/players?balance=credit")} hint="Saldo a favor dos jogadores"/>
        <StatCard tone="warn" icon={HandCoins} label="Dívidas de jogadores" value={formatMoney(f.player_debt_cents)} href={link(permissions.PLAYERS_MANAGE, "/admin/players?balance=debt")} hint="Valores a receber dos jogadores"/>
      </div>
    </section>

    <section className="grid gap-3" aria-label="Alertas de estoque">
      <h2 className="page-eyebrow">Estoque</h2>
      <div className="stat-grid">
        <StatCard tone={stock.low ? "warn" : undefined} icon={AlertTriangle} label="Estoque baixo" value={stock.low} href={link(permissions.STOCK_MANAGE, "/admin/stock?status=low")} hint="Produtos ativos abaixo do mínimo"/>
        <StatCard tone={stock.empty ? "danger" : undefined} icon={PackageX} label="Sem estoque" value={stock.empty} href={link(permissions.STOCK_MANAGE, "/admin/stock?status=empty")} hint="Produtos ativos com saldo zerado"/>
      </div>
    </section>

    <DashboardCharts daily={data.daily} payments={data.payments} cashFlow={data.cashFlow}/>

    <section className="card">
      <div className="panel-head">
        <div><h2 className="panel-title">Produtos mais vendidos — mês</h2><p className="panel-desc">Ordenados pela quantidade vendida no mês corrente.</p></div>
        {hasPermission(user, permissions.SALES_VIEW) && <Link className="btn btn-ghost btn-sm" href="/admin/sales">Ver relatório</Link>}
      </div>
      {data.top.length ? <div className="table-wrap"><table>
        <thead><tr><th>#</th><th>Produto</th><th className="num">Quantidade</th><th className="num">Faturamento</th><th className="num">Margem aprox.</th></tr></thead>
        <tbody>{data.top.map((product, index) => <tr key={product.name}>
          <td className="muted">{index + 1}</td>
          <td className="cell-wrap"><b>{product.name}</b></td>
          <td className="num">{product.quantity}</td>
          <td className="num">{formatMoney(product.revenue_cents)}</td>
          <td className={`num ${product.margin_cents < 0 ? "neg" : ""}`}>{formatMoney(product.margin_cents)}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon={ShoppingBag} title="Nenhuma venda no período" description="Os produtos mais vendidos aparecem aqui assim que houver vendas no mês."/>}
    </section>
  </div>;
}
