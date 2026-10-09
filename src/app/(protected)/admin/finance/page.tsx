import { ActionForm } from "@/components/action-form";
import { pool } from "@/db";
import { formatMoney } from "@/lib/money";
import { financialAccountAction, financialSettlementAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";
const dateInSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateTimeInSaoPaulo = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");
const label = (value: string) => ({ PAYABLE: "A pagar", RECEIVABLE: "A receber", OPEN: "Aberta", PARTIAL: "Parcial", SETTLED: "Liquidada", CANCELED: "Cancelada" }[value] ?? value);

export default async function FinancePage() {
  const [installments, settlements, players, methods] = await Promise.all([
    pool.query<{ installment_id:string; account_id:string; type:string; description:string; counterparty_name:string; player_name:string|null; installment_number:number; due_date:string; amount_cents:number; settled_cents:number; status:string; notes:string|null }>(`SELECT i.id installment_id,a.id account_id,a.type,a.description,a.counterparty_name,p.name player_name,i.installment_number,i.due_date::text,i.amount_cents,i.settled_cents,i.status,a.notes
      FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id LEFT JOIN players p ON p.id=a.player_id
      ORDER BY CASE WHEN i.status IN ('OPEN','PARTIAL') THEN 0 ELSE 1 END,i.due_date DESC,a.created_at DESC LIMIT 300`),
    pool.query<{ id:string; type:string; description:string; counterparty_name:string; amount_cents:number; method_name:string; occurred_at:Date; person_name:string|null; notes:string|null }>(`SELECT fs.id,a.type,a.description,a.counterparty_name,fs.amount_cents,pm.name method_name,fs.occurred_at,fs.person_name,fs.notes
      FROM financial_settlements fs JOIN financial_installments i ON i.id=fs.installment_id JOIN financial_accounts a ON a.id=i.account_id JOIN payment_methods pm ON pm.code=fs.method_code ORDER BY fs.occurred_at DESC LIMIT 100`),
    pool.query<{ id:string; name:string }>("SELECT id,name FROM players WHERE active=true ORDER BY name"),
    pool.query<{ code:string; name:string }>("SELECT code,name FROM payment_methods WHERE active=true AND code NOT IN ('FUTURE','PLAYER_CREDIT') ORDER BY sort_order"),
  ]);
  return <div className="grid gap-6"><header><p className="text-sm text-gray-500 font-bold">FLUXO FINANCEIRO</p><h1 className="text-3xl font-black">Contas a pagar e receber</h1><p className="text-gray-500">Parcelas, vencimentos e liquidações sem misturar caixa com faturamento.</p></header>
    <ActionForm action={financialAccountAction} className="card p-5 grid md:grid-cols-4 gap-3">
      <label className="label">Tipo<select className="field" name="type"><option value="RECEIVABLE">A receber</option><option value="PAYABLE">A pagar</option></select></label>
      <label className="label md:col-span-2">Descrição<input className="field" name="description" required placeholder="Ex.: compra de boosters / patrocínio"/></label>
      <label className="label">Valor total<input className="field" name="total" required inputMode="decimal" placeholder="0,00"/></label>
      <label className="label">De/para quem<input className="field" name="counterpartyName" required/></label>
      <label className="label">Jogador relacionado<select className="field" name="playerId"><option value="">Nenhum</option>{players.rows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="label">Data de emissão<input className="field" type="date" name="issueDate" defaultValue={dateInSaoPaulo()} required/></label>
      <label className="label">Prazos em dias<input className="field" name="terms" defaultValue="0" placeholder="0/30/60/90"/><small className="text-gray-500">Use 30/60/90 para parcelar.</small></label>
      <label className="label md:col-span-4">Observações<textarea className="field" name="notes" rows={2}/></label>
    </ActionForm>
    <section className="card"><div className="p-5"><h2 className="font-black">Parcelas</h2></div><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Descrição / pessoa</th><th>Parcela</th><th>Vencimento</th><th>Saldo</th><th>Status</th><th>Registrar liquidação</th></tr></thead><tbody>{installments.rows.map(row=>{const remaining=row.amount_cents-row.settled_cents;return <tr key={row.installment_id}><td><span className={row.type==="RECEIVABLE"?"badge badge-ok":"badge"}>{label(row.type)}</span></td><td><b>{row.description}</b><small className="block text-gray-500">{row.counterparty_name}{row.player_name?` · ${row.player_name}`:""}</small></td><td>{row.installment_number}</td><td>{new Date(`${row.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</td><td><b>{formatMoney(remaining)}</b><small className="block text-gray-500">de {formatMoney(row.amount_cents)}</small></td><td>{label(row.status)}</td><td>{["OPEN","PARTIAL"].includes(row.status)?<ActionForm action={financialSettlementAction} className="grid sm:grid-cols-2 gap-2 min-w-[360px]"><input type="hidden" name="installmentId" value={row.installment_id}/><label className="label">Valor<input className="field" name="amount" defaultValue={(remaining/100).toFixed(2)} required/></label><label className="label">Forma<select className="field" name="methodCode">{methods.rows.map(m=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label><label className="label">Data/hora<input className="field" type="datetime-local" name="occurredAt" defaultValue={dateTimeInSaoPaulo()} required/></label><label className="label">Recebido de / pago a<input className="field" name="personName" placeholder="Opcional"/></label><label className="label sm:col-span-2">Observação<input className="field" name="notes"/></label></ActionForm>:"—"}</td></tr>})}{!installments.rowCount&&<tr><td colSpan={7}>Nenhuma conta cadastrada.</td></tr>}</tbody></table></div></section>
    <section className="card"><div className="p-5"><h2 className="font-black">Últimas liquidações</h2></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Pessoa</th><th>Forma</th><th>Valor</th></tr></thead><tbody>{settlements.rows.map(row=><tr key={row.id}><td>{row.occurred_at.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</td><td>{label(row.type)}</td><td>{row.description}</td><td>{row.person_name||row.counterparty_name}</td><td>{row.method_name}</td><td className="font-bold">{formatMoney(row.amount_cents)}</td></tr>)}{!settlements.rowCount&&<tr><td colSpan={6}>Nenhuma liquidação registrada.</td></tr>}</tbody></table></div></section>
  </div>;
}
