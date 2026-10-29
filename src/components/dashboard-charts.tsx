"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";

const colors = ["#172744", "#12b76a", "#f79009", "#6172f3", "#98a2b3"];
const axis = { fontSize: 12, fill: "#667085" };
const tooltip = { contentStyle: { border: "1px solid #e4e7ec", borderRadius: 10, boxShadow: "0 6px 18px rgb(16 24 40 / .1)", fontSize: 13 }, cursor: { fill: "#f2f4f7" } };

const compactMoney = (cents: number) => {
  const reais = cents / 100;
  return reais >= 1000 ? `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(reais).toLocaleString("pt-BR")}`;
};

function Panel({ title, description, children, className = "" }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>
    <div className="panel-head"><div><h2 className="panel-title">{title}</h2>{description && <p className="panel-desc">{description}</p>}</div></div>
    <div className="panel-body">{children}</div>
  </section>;
}

export function DashboardCharts({ daily, payments, cashFlow }: { daily: { day: string; revenue_cents: number }[]; payments: { name: string; total_cents: number }[]; cashFlow: { day: string; received_cents: number; paid_cents: number }[] }) {
  const paymentTotal = payments.reduce((total, payment) => total + payment.total_cents, 0);
  return <div className="grid lg:grid-cols-[2fr_1fr] gap-5">
    <Panel title="Faturamento — últimos 14 dias">
      <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{ left: 4, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e7ec"/>
        <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={{ stroke: "#d0d5dd" }}/>
        <YAxis tick={axis} tickLine={false} axisLine={false} width={92} tickFormatter={compactMoney}/>
        <Tooltip {...tooltip} formatter={(value) => [formatMoney(Number(value)), "Faturamento"]}/>
        <Bar dataKey="revenue_cents" fill="#12b76a" radius={[6, 6, 0, 0]} maxBarSize={36}/>
      </BarChart></ResponsiveContainer></div>
    </Panel>
    <Panel title="Por pagamento — mês" description={paymentTotal ? `Total de ${formatMoney(paymentTotal)}` : "Sem pagamentos no mês."}>
      <div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart>
        <Pie data={payments} dataKey="total_cents" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="none">{payments.map((_, index) => <Cell key={index} fill={colors[index % colors.length]}/>)}</Pie>
        <Tooltip {...tooltip} formatter={(value) => formatMoney(Number(value))}/>
      </PieChart></ResponsiveContainer></div>
      <div className="grid gap-2 mt-2">{payments.map((payment, index) => <div className="flex justify-between gap-3 text-sm" key={payment.name}>
        <span className="flex items-center gap-2"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: colors[index % colors.length] }}/>{payment.name}</span>
        <b>{formatMoney(payment.total_cents)}</b>
      </div>)}</div>
    </Panel>
    <Panel className="lg:col-span-2" title="Fluxo financeiro realizado — últimos 14 dias" description="Liquidações de contas; não altera o faturamento das vendas.">
      <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={cashFlow} margin={{ left: 4, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e7ec"/>
        <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={{ stroke: "#d0d5dd" }}/>
        <YAxis tick={axis} tickLine={false} axisLine={false} width={92} tickFormatter={compactMoney}/>
        <Tooltip {...tooltip} formatter={(value, name) => [formatMoney(Number(value)), name === "received_cents" ? "Recebido" : "Pago"]}/>
        <Legend iconType="circle" formatter={(value) => <span style={{ color: "#344054", fontSize: 13 }}>{value === "received_cents" ? "Recebido" : "Pago"}</span>}/>
        <Bar dataKey="received_cents" fill="#12b76a" radius={[6, 6, 0, 0]} maxBarSize={22}/>
        <Bar dataKey="paid_cents" fill="#f04438" radius={[6, 6, 0, 0]} maxBarSize={22}/>
      </BarChart></ResponsiveContainer></div>
    </Panel>
  </div>;
}
