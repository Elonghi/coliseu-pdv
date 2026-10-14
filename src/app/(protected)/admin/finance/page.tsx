import Link from "next/link";
import { pool } from "@/db";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
const label = (value: string) => ({ PAYABLE: "A pagar", RECEIVABLE: "A receber", OPEN: "Aberta", PARTIAL: "Parcial", SETTLED: "Liquidada", CANCELED: "Cancelada" }[value] ?? value);
const dateInSaoPaulo = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const dueTiming = (dueDate: string, today: string) => {
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return { days, text: "Vence hoje" };
  if (days === 1) return { days, text: "Falta 1 dia" };
  if (days > 1) return { days, text: `Faltam ${days} dias` };
  if (days === -1) return { days, text: "Venceu há 1 dia" };
  return { days, text: `Venceu há ${Math.abs(days)} dias` };
};

export default async function FinancePage() {
  const today = dateInSaoPaulo();
  const [installments, settlements] = await Promise.all([
    pool.query<{ installment_id:string; account_id:string; type:string; description:string; counterparty_name:string; player_name:string|null; installment_number:number; source_reference:string|null; due_date:string; amount_cents:number; settled_cents:number; status:string; notes:string|null; fiscal_invoice_id:string|null; fiscal_number:string|null; fiscal_series:string|null }>(`SELECT i.id installment_id,a.id account_id,a.type,a.description,a.counterparty_name,p.name player_name,i.installment_number,i.source_reference,i.due_date::text,i.amount_cents,i.settled_cents,i.status,a.notes,a.fiscal_invoice_id,fi.number fiscal_number,fi.series fiscal_series
      FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id LEFT JOIN players p ON p.id=a.player_id LEFT JOIN fiscal_invoices fi ON fi.id=a.fiscal_invoice_id
      ORDER BY CASE WHEN i.status IN ('OPEN','PARTIAL') THEN 0 ELSE 1 END,i.due_date DESC,a.created_at DESC LIMIT 300`),
    pool.query<{ id:string; type:string; description:string; counterparty_name:string; amount_cents:number; method_name:string; occurred_at:Date; person_name:string|null; notes:string|null }>(`SELECT fs.id,a.type,a.description,a.counterparty_name,fs.amount_cents,pm.name method_name,fs.occurred_at,fs.person_name,fs.notes
      FROM financial_settlements fs JOIN financial_installments i ON i.id=fs.installment_id JOIN financial_accounts a ON a.id=i.account_id JOIN payment_methods pm ON pm.code=fs.method_code ORDER BY fs.occurred_at DESC LIMIT 100`),
  ]);
  return <div className="grid gap-6"><header><p className="text-sm text-gray-500 font-bold">FLUXO FINANCEIRO</p><h1 className="text-3xl font-black">Contas a pagar e receber</h1><p className="text-gray-500">Contas e liquidações geradas automaticamente pelas operações do sistema.</p></header>
    <section className="card"><div className="p-5"><h2 className="font-black">Parcelas</h2></div><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Descrição / pessoa</th><th>Parcela</th><th>Vencimento</th><th>Saldo</th><th>Status</th></tr></thead><tbody>{installments.rows.map(row=>{const remaining=row.amount_cents-row.settled_cents;const timing=dueTiming(row.due_date,today);const overdue=timing.days<0&&["OPEN","PARTIAL"].includes(row.status);return <tr key={row.installment_id}><td><span className={row.type==="RECEIVABLE"?"badge badge-ok":"badge"}>{label(row.type)}</span></td><td><b>{row.description}</b><small className="block text-gray-500">{row.counterparty_name}{row.player_name?` · ${row.player_name}`:""}</small>{row.fiscal_invoice_id&&<Link className="text-xs font-bold text-blue-700" href={`/admin/fiscal/${row.fiscal_invoice_id}`}>Ver NF-e {row.fiscal_number??""}{row.fiscal_series?` · série ${row.fiscal_series}`:""}</Link>}</td><td>{row.source_reference?`Duplicata ${row.source_reference}`:row.installment_number}</td><td>{new Date(`${row.due_date}T12:00:00`).toLocaleDateString("pt-BR")}<small className={`block ${overdue?"font-bold text-red-600":"text-gray-500"}`}>{timing.text}</small></td><td><b>{formatMoney(remaining)}</b><small className="block text-gray-500">de {formatMoney(row.amount_cents)}</small></td><td>{label(row.status)}</td></tr>})}{!installments.rowCount&&<tr><td colSpan={6}>Nenhuma conta gerada.</td></tr>}</tbody></table></div></section>
    <section className="card"><div className="p-5"><h2 className="font-black">Últimas liquidações</h2></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Pessoa</th><th>Forma</th><th>Valor</th></tr></thead><tbody>{settlements.rows.map(row=><tr key={row.id}><td>{row.occurred_at.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</td><td>{label(row.type)}</td><td>{row.description}</td><td>{row.person_name||row.counterparty_name}</td><td>{row.method_name}</td><td className="font-bold">{formatMoney(row.amount_cents)}</td></tr>)}{!settlements.rowCount&&<tr><td colSpan={6}>Nenhuma liquidação registrada.</td></tr>}</tbody></table></div></section>
  </div>;
}
