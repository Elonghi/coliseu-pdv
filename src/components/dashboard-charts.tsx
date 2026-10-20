"use client";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";
import { useInterfaceMode } from "@/components/interface-mode-provider";

export function DashboardCharts({ daily, payments, cashFlow }: { daily: { day: string; revenue_cents: number }[]; payments: { name: string; total_cents: number }[]; cashFlow: { day:string; received_cents:number; paid_cents:number }[] }) {
  const { mode } = useInterfaceMode();
  const colors = mode === "MODERN" ? ["#20352e", "#39745e", "#a7752e", "#6d766f"] : ["#172744", "#12b76a", "#f79009", "#6172f3"];
  const revenueColor = mode === "MODERN" ? "#39745e" : "#12b76a";
  const expenseColor = mode === "MODERN" ? "#a65248" : "#f04438";
  const radius = mode === "MODERN" ? 2 : 5;
  return <div className="dashboard-charts grid lg:grid-cols-[2fr_1fr] gap-5">
    <section className="card p-5"><h2 className="font-black mb-5">Faturamento — últimos 14 dias</h2><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={daily}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day"/><YAxis tickFormatter={(v) => `R$${v/100}`}/><Tooltip formatter={(v) => formatMoney(Number(v))}/><Bar dataKey="revenue_cents" fill={revenueColor} radius={[radius,radius,0,0]}/></BarChart></ResponsiveContainer></div></section>
    <section className="card p-5"><h2 className="font-black mb-2">Por pagamento — mês</h2><div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={payments} dataKey="total_cents" nameKey="name" innerRadius={48} outerRadius={78}>{payments.map((_,i) => <Cell key={i} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={(v) => formatMoney(Number(v))}/></PieChart></ResponsiveContainer></div><div className="grid gap-2">{payments.map((p,i) => <div className="flex justify-between text-sm" key={p.name}><span><i className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{background:colors[i%colors.length]}}/>{p.name}</span><b>{formatMoney(p.total_cents)}</b></div>)}</div></section>
    <section className="card p-5 lg:col-span-2"><h2 className="font-black mb-1">Fluxo financeiro realizado — últimos 14 dias</h2><p className="text-sm text-gray-500 mb-5">Liquidações de contas; não altera o faturamento das vendas.</p><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={cashFlow}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day"/><YAxis tickFormatter={(v)=>`R$${v/100}`}/><Tooltip formatter={(v,name)=>[formatMoney(Number(v)),name==="received_cents"?"Recebido":"Pago"]}/><Bar dataKey="received_cents" fill={revenueColor} radius={[radius,radius,0,0]}/><Bar dataKey="paid_cents" fill={expenseColor} radius={[radius,radius,0,0]}/></BarChart></ResponsiveContainer></div></section>
  </div>;
}
