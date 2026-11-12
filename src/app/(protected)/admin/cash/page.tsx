import { ArrowDownUp, Banknote, Lock, Plus, Store, Unlock } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { Badge, DateTimeCell, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { pool } from "@/db";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { cashCloseAction, cashMovementAction, cashOpenAction, cashRegisterAction } from "@/modules/cash/actions";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const user = await requirePermission(permissions.CASH_MANAGE);
  const [registers, sessions, recent] = await Promise.all([
    pool.query("SELECT id,name FROM cash_registers WHERE active=true ORDER BY name"),
    pool.query(`SELECT cs.id,cs.operator_id,cr.name register_name,u.name operator_name,cs.opening_amount_cents,cs.opened_at,
      cs.opening_amount_cents+COALESCE((SELECT sum(CASE WHEN cm.type='SUPPLY' THEN cm.amount_cents ELSE -cm.amount_cents END) FROM cash_movements cm WHERE cm.session_id=cs.id),0)+COALESCE((SELECT sum(p.amount_applied_cents) FROM sales s JOIN payments p ON p.sale_id=s.id WHERE s.cash_session_id=cs.id AND s.status='CONFIRMED' AND p.method_code='CASH'),0)::int expected_cents
      FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.register_id JOIN users u ON u.id=cs.operator_id WHERE cs.status='OPEN' AND ($1::boolean OR cs.operator_id=$2) ORDER BY cs.opened_at`, [user.role === "ADMIN", user.id]),
    pool.query(`SELECT cs.id,cr.name register_name,u.name operator_name,cs.opened_at,cs.closed_at,cs.expected_amount_cents,cs.closing_counted_cents,cs.difference_cents FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.register_id JOIN users u ON u.id=cs.operator_id WHERE cs.status='CLOSED' AND ($1::boolean OR cs.operator_id=$2) ORDER BY cs.closed_at DESC LIMIT 30`, [user.role === "ADMIN", user.id]),
  ]);
  const ownOpen = sessions.rows.find((row) => row.operator_id === user.id);
  const expectedTotal = sessions.rows.reduce((total, row) => total + Number(row.expected_cents), 0);

  return <div className="section-gap">
    <PageHeader
      eyebrow="Operação"
      title="Caixas"
      description="Abertura, suprimento, sangria, conferência e fechamento por operador."
      actions={<>
        {user.role === "ADMIN" && <Modal trigger={<><Plus size={16}/>Novo caixa</>} size="sm" title="Novo caixa" description="Cadastre um ponto de venda físico para abrir sessões.">
          <ActionForm action={cashRegisterAction} submitLabel="Cadastrar caixa" className="grid gap-4"><label className="label">Nome<input className="field" name="name" placeholder="Ex.: Caixa balcão" required/></label></ActionForm>
        </Modal>}
        {!ownOpen && <Modal trigger={<><Unlock size={16}/>Abrir meu caixa</>} triggerClassName="btn btn-success" size="sm" title="Abrir meu caixa" description="Informe o fundo de troco com que o caixa começa o dia.">
          <ActionForm action={cashOpenAction} submitLabel="Abrir caixa" className="grid gap-4">
            <label className="label">Caixa<select className="field" name="registerId" required>{registers.rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="label">Fundo inicial (R$)<input className="field" name="openingAmount" inputMode="decimal" defaultValue="0,00" required/></label>
            <label className="label">Observação<input className="field" name="notes"/></label>
          </ActionForm>
        </Modal>}
      </>}
    />

    <section className="stat-grid" aria-label="Resumo dos caixas">
      <StatCard tone={sessions.rowCount ? "ok" : undefined} icon={Store} label="Sessões abertas" value={sessions.rowCount ?? 0} hint={ownOpen ? "Você tem um caixa aberto" : "Você não tem caixa aberto"}/>
      <StatCard icon={Banknote} label="Dinheiro esperado em caixa" value={formatMoney(expectedTotal)} hint="Fundo + suprimentos − sangrias + vendas em dinheiro"/>
    </section>

    <section className="grid grid-cols-1 gap-4">
      <h2 className="text-lg font-bold">Sessões abertas</h2>
      {sessions.rows.map((session) => <article className="card" key={session.id}>
        <div className="panel-head">
          <div><h3 className="panel-title">{session.register_name} · {session.operator_name}</h3><p className="panel-desc">Aberto em {formatDateTime(session.opened_at)} · fundo inicial {formatMoney(session.opening_amount_cents)}</p></div>
          <div className="cell-main num"><small>Saldo esperado</small><b className="text-xl">{formatMoney(session.expected_cents)}</b></div>
        </div>
        <div className="panel-body flex flex-wrap gap-2">
          <Modal trigger={<><ArrowDownUp size={15}/>Suprimento / sangria</>} size="sm" title="Registrar movimentação" description={`${session.register_name} · saldo esperado ${formatMoney(session.expected_cents)}`}>
            <ActionForm action={cashMovementAction} submitLabel="Registrar movimentação" className="grid gap-4">
              <input type="hidden" name="sessionId" value={session.id}/>
              <label className="label">Tipo<select className="field" name="type"><option value="SUPPLY">Suprimento (entrada de dinheiro)</option><option value="WITHDRAWAL">Sangria (retirada de dinheiro)</option></select></label>
              <label className="label">Valor (R$)<input className="field" name="amount" inputMode="decimal" placeholder="0,00" required/></label>
              <label className="label">Motivo<input className="field" name="reason" minLength={5} placeholder="Ex.: reforço de troco, depósito bancário" required/></label>
            </ActionForm>
          </Modal>
          <Modal trigger={<><Lock size={15}/>Fechar e conferir</>} triggerClassName="btn btn-primary" size="sm" title="Fechar caixa" description={`Conte o dinheiro físico. O sistema esperava ${formatMoney(session.expected_cents)}.`}>
            <ActionForm action={cashCloseAction} submitLabel="Fechar e conferir" className="grid gap-4">
              <input type="hidden" name="sessionId" value={session.id}/>
              <label className="label">Valor contado (R$)<input className="field" name="countedAmount" inputMode="decimal" placeholder="0,00" required/></label>
              <label className="label">Observação<input className="field" name="notes"/></label>
            </ActionForm>
          </Modal>
        </div>
      </article>)}
      {!sessions.rowCount && <div className="card"><EmptyState icon={Store} title="Nenhuma sessão aberta" description={ownOpen ? undefined : "Use “Abrir meu caixa” para começar a operar."}/></div>}
    </section>

    <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">Fechamentos recentes</h2><p className="panel-desc">Últimos 30 fechamentos conferidos.</p></div></div>
      {recent.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Caixa</th><th>Operador</th><th>Abertura</th><th>Fechamento</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferença</th></tr></thead>
        <tbody>{recent.rows.map((row) => <tr key={row.id}>
          <td><b>{row.register_name}</b></td>
          <td>{row.operator_name}</td>
          <td><DateTimeCell value={row.opened_at}/></td>
          <td><DateTimeCell value={row.closed_at}/></td>
          <td className="num">{formatMoney(row.expected_amount_cents)}</td>
          <td className="num">{formatMoney(row.closing_counted_cents)}</td>
          <td className="num">{row.difference_cents === 0 ? <Badge tone="ok" dot>Conferido</Badge> : <Badge tone={row.difference_cents > 0 ? "info" : "danger"}>{row.difference_cents > 0 ? "Sobra" : "Falta"} {formatMoney(Math.abs(row.difference_cents))}</Badge>}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState title="Nenhum fechamento ainda" description="Os caixas fechados aparecem aqui com a conferência."/>}
    </section>
  </div>;
}
