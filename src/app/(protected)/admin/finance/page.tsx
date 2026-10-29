import Link from "next/link";
import { AlertCircle, Banknote, FileUp, ListChecks, Receipt, Wallet } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { BatchPicker } from "@/components/batch-picker";
import { FilterBar, MoreFilters, SearchField } from "@/components/filter-bar";
import { Modal } from "@/components/modal";
import { Badge, Chips, DateTimeCell, EmptyState, PageHeader, StatCard, Tabs, type Tone } from "@/components/ui";
import { pool } from "@/db";
import { formatDate, formatDueDate } from "@/lib/format";
import { formatMoney, parseMoney } from "@/lib/money";
import { queryHref } from "@/lib/query-string";
import { financialSettlementAction } from "@/modules/admin/actions";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { bankReconcileAction, financialBatchSettlementAction, financialReversalAction, ofxImportAction } from "@/modules/finance/actions";

export const dynamic = "force-dynamic";

const statusTone: Record<string, Tone> = { OPEN: "info", PARTIAL: "warn", SETTLED: "ok", CANCELED: "neutral" };
const label = (value: string) => ({ PAYABLE: "A pagar", RECEIVABLE: "A receber", OPEN: "Aberta", PARTIAL: "Parcial", SETTLED: "Liquidada", CANCELED: "Cancelada" }[value] ?? value);
const formatDocument = (value: string | null) => value?.length === 14 ? value.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5") : value;
const dateInSaoPaulo = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const dateTimeInSaoPaulo = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
const dueTiming = (dueDate: string, today: string) => {
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return { days, text: "Vence hoje" };
  if (days === 1) return { days, text: "Falta 1 dia" };
  if (days > 1) return { days, text: `Faltam ${days} dias` };
  if (days === -1) return { days, text: "Venceu há 1 dia" };
  return { days, text: `Venceu há ${Math.abs(days)} dias` };
};
const optionalMoney = (value?: string) => {
  if (!value?.trim()) return null;
  try { return parseMoney(value); } catch { return null; }
};

type Installment = { installment_id: string; account_id: string; type: string; description: string; counterparty_name: string; player_name: string | null; installment_number: number; source_reference: string | null; due_date: string; amount_cents: number; settled_cents: number; status: string; notes: string | null; fiscal_invoice_id: string | null; fiscal_number: string | null; fiscal_series: string | null; supplier_document: string | null };
type PaymentMethod = { code: string; name: string };
type Settlement = { id: string; type: string; description: string; counterparty_name: string; amount_cents: number; method_name: string; occurred_at: Date; person_name: string | null; notes: string | null; reversed_at: Date | null; reversal_reason: string | null };
type Search = Record<string, string | undefined>;
const tabs = ["pagar", "receber", "liquidacoes", "conciliacao"] as const;

function InstallmentTable({ rows, today, paymentMethods = [], occurredAt, allowSettlement = false, showSupplier = false }: { rows: Installment[]; today: string; paymentMethods?: PaymentMethod[]; occurredAt?: string; allowSettlement?: boolean; showSupplier?: boolean }) {
  return <div className="table-wrap"><table>
    <thead><tr><th>Descrição{showSupplier ? " / pessoa" : ""}</th><th>Parcela</th><th>Vencimento</th><th className="num">Saldo</th><th>Status</th>{allowSettlement && <th className="col-actions"><span className="sr-only">Ação</span></th>}</tr></thead>
    <tbody>{rows.map((row) => {
      const remaining = row.amount_cents - row.settled_cents;
      const timing = dueTiming(row.due_date, today);
      const open = ["OPEN", "PARTIAL"].includes(row.status);
      const overdue = timing.days < 0 && open;
      return <tr key={row.installment_id}>
        <td className="cell-wrap"><span className="cell-main">
          <b>{row.description}</b>
          {showSupplier && <small>{row.counterparty_name}{row.player_name ? ` · ${row.player_name}` : ""}</small>}
          {row.fiscal_invoice_id && <Link className="link text-xs" href={`/admin/fiscal/${row.fiscal_invoice_id}`}>Ver NF-e {row.fiscal_number ?? ""}{row.fiscal_series ? ` · série ${row.fiscal_series}` : ""}</Link>}
        </span></td>
        <td>{row.source_reference ? `Duplicata ${row.source_reference}` : row.installment_number}</td>
        <td><span className="cell-main"><b>{formatDueDate(row.due_date)}</b>{open && <small className={overdue ? "neg" : ""}>{timing.text}</small>}</span></td>
        <td className="num"><span className="cell-main"><b>{formatMoney(remaining)}</b><small>de {formatMoney(row.amount_cents)}</small></span></td>
        <td><Badge tone={overdue ? "danger" : statusTone[row.status] ?? "neutral"} dot>{overdue ? "Vencida" : label(row.status)}</Badge></td>
        {allowSettlement && <td className="col-actions">{open && row.fiscal_invoice_id ? <Modal trigger="Dar baixa" triggerClassName="btn btn-primary btn-sm" title="Dar baixa" description={`${row.counterparty_name} · ${row.source_reference ? `duplicata ${row.source_reference}` : `parcela ${row.installment_number}`} · saldo ${formatMoney(remaining)}`}>
          <ActionForm action={financialSettlementAction} submitLabel="Confirmar baixa" className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="installmentId" value={row.installment_id}/>
            <label className="label">Valor pago (R$)<input className="field" name="amount" inputMode="decimal" defaultValue={(remaining / 100).toFixed(2).replace(".", ",")} required/></label>
            <label className="label">Data e hora do pagamento<input className="field" name="occurredAt" type="datetime-local" defaultValue={occurredAt} required/></label>
            <label className="label">Forma de pagamento<select className="field" name="methodCode" required>{paymentMethods.map((method) => <option value={method.code} key={method.code}>{method.name}</option>)}</select></label>
            <label className="label">Pago a<input className="field" name="personName" maxLength={180} defaultValue={row.counterparty_name}/></label>
            <label className="label sm:col-span-2">Observação<input className="field" name="notes" maxLength={1000} placeholder="Ex.: comprovante, conta bancária ou referência"/></label>
          </ActionForm>
        </Modal> : <span className="muted" title={open ? "A baixa manual é feita apenas em duplicatas de NF-e" : undefined}>—</span>}</td>}
      </tr>;
    })}</tbody>
  </table></div>;
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission(permissions.FINANCE_MANAGE);
  const query = await searchParams;
  const today = dateInSaoPaulo();
  const occurredAt = dateTimeInSaoPaulo();
  const q = query.q?.trim().slice(0, 120) ?? "";
  const supplier = query.supplier?.trim().slice(0, 180) ?? "";
  const type = ["PAYABLE", "RECEIVABLE"].includes(query.type ?? "") ? query.type! : "";
  const status = ["OPEN", "PARTIAL", "SETTLED", "CANCELED"].includes(query.status ?? "") ? query.status! : "";
  const due = ["OVERDUE", "TODAY", "NEXT_7", "NEXT_30"].includes(query.due ?? "") ? query.due! : "ALL";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") ? query.from! : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "") ? query.to! : null;
  const minCents = optionalMoney(query.min);
  const maxCents = optionalMoney(query.max);
  const hasFilters = Boolean(q || supplier || type || status || due !== "ALL" || from || to || minCents !== null || maxCents !== null);
  const advancedActive = Boolean(from || to || minCents !== null || maxCents !== null);
  const tab = tabs.find((item) => item === query.tab) ?? (type === "RECEIVABLE" ? "receber" : "pagar");

  const [installments, dueCounts, settlements, paymentMethods, bankTransactions, suppliers] = await Promise.all([
    pool.query<Installment>(`SELECT i.id installment_id,a.id account_id,a.type,a.description,a.counterparty_name,p.name player_name,i.installment_number,i.source_reference,i.due_date::text,i.amount_cents,i.settled_cents,i.status,a.notes,a.fiscal_invoice_id,fi.number fiscal_number,fi.series fiscal_series,fi.issuer_cnpj_cpf supplier_document
      FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id LEFT JOIN players p ON p.id=a.player_id LEFT JOIN fiscal_invoices fi ON fi.id=a.fiscal_invoice_id
      WHERE ($1='' OR a.description ILIKE $2 OR a.counterparty_name ILIKE $2 OR COALESCE(p.name,'') ILIKE $2 OR COALESCE(fi.number,'') ILIKE $2 OR COALESCE(i.source_reference,'') ILIKE $2)
        AND ($3='' OR a.counterparty_name ILIKE $4 OR COALESCE(fi.issuer_cnpj_cpf,'') ILIKE $4)
        AND ($5='' OR a.type::text=$5) AND ($6='' OR i.status::text=$6)
        AND ($7::date IS NULL OR i.due_date >= $7::date) AND ($8::date IS NULL OR i.due_date <= $8::date)
        AND ($9::int IS NULL OR i.amount_cents-i.settled_cents >= $9::int) AND ($10::int IS NULL OR i.amount_cents-i.settled_cents <= $10::int)
        AND ($11='ALL' OR ($11='OVERDUE' AND i.status IN ('OPEN','PARTIAL') AND i.due_date<$12::date) OR ($11='TODAY' AND i.status IN ('OPEN','PARTIAL') AND i.due_date=$12::date) OR ($11='NEXT_7' AND i.status IN ('OPEN','PARTIAL') AND i.due_date BETWEEN $12::date AND $12::date+7) OR ($11='NEXT_30' AND i.status IN ('OPEN','PARTIAL') AND i.due_date BETWEEN $12::date AND $12::date+30))
      ORDER BY a.type,a.counterparty_name,CASE WHEN i.status IN ('OPEN','PARTIAL') THEN 0 ELSE 1 END,i.due_date,a.created_at DESC LIMIT 500`, [q, `%${q}%`, supplier, `%${supplier}%`, type, status, from, to, minCents, maxCents, due, today]),
    pool.query<{ overdue: number; today: number; next7: number; next30: number }>("SELECT count(*) FILTER (WHERE i.due_date<$1::date)::int overdue,count(*) FILTER (WHERE i.due_date=$1::date)::int today,count(*) FILTER (WHERE i.due_date BETWEEN $1::date AND $1::date+7)::int next7,count(*) FILTER (WHERE i.due_date BETWEEN $1::date AND $1::date+30)::int next30 FROM financial_installments i WHERE i.status IN ('OPEN','PARTIAL')", [today]),
    ["liquidacoes", "conciliacao"].includes(tab) ? pool.query<Settlement>(`SELECT fs.id,a.type,a.description,a.counterparty_name,fs.amount_cents,pm.name method_name,fs.occurred_at,fs.person_name,fs.notes,fs.reversed_at,fs.reversal_reason
      FROM financial_settlements fs JOIN financial_installments i ON i.id=fs.installment_id JOIN financial_accounts a ON a.id=i.account_id JOIN payment_methods pm ON pm.code=fs.method_code ORDER BY fs.occurred_at DESC LIMIT 100`) : null,
    pool.query<PaymentMethod>("SELECT code,name FROM payment_methods WHERE active=true AND code NOT IN ('FUTURE','PLAYER_CREDIT') ORDER BY sort_order,name"),
    tab === "conciliacao" ? pool.query<{ id: string; occurred_on: string; amount_cents: number; memo: string | null; settlement_id: string | null }>("SELECT id,occurred_on::text,amount_cents,memo,settlement_id FROM bank_transactions ORDER BY occurred_on DESC,created_at DESC LIMIT 100") : null,
    pool.query<{ counterparty_name: string }>("SELECT DISTINCT counterparty_name FROM financial_accounts WHERE type='PAYABLE' ORDER BY counterparty_name LIMIT 250"),
  ]);

  const supplierGroups = Array.from(installments.rows.filter((row) => row.type === "PAYABLE").reduce((groups, row) => {
    const key = row.supplier_document ?? row.counterparty_name.trim().toLocaleLowerCase("pt-BR");
    const current = groups.get(key) ?? { key, supplier: row.counterparty_name, document: row.supplier_document, rows: [] as Installment[], openCents: 0 };
    current.rows.push(row);
    if (["OPEN", "PARTIAL"].includes(row.status)) current.openCents += row.amount_cents - row.settled_cents;
    groups.set(key, current);
    return groups;
  }, new Map<string, { key: string; supplier: string; document: string | null; rows: Installment[]; openCents: number }>()).values());
  const receivables = installments.rows.filter((row) => row.type === "RECEIVABLE");
  const openPayables = installments.rows.filter((row) => row.type === "PAYABLE" && ["OPEN", "PARTIAL"].includes(row.status));
  const batchPayables = openPayables.filter((row) => row.fiscal_invoice_id);
  const filteredBalance = installments.rows.filter((row) => ["OPEN", "PARTIAL"].includes(row.status)).reduce((total, row) => total + row.amount_cents - row.settled_cents, 0);
  const overdueCount = installments.rows.filter((row) => ["OPEN", "PARTIAL"].includes(row.status) && row.due_date < today).length;
  const tabHref = (value: string) => queryHref("/admin/finance", query, { tab: value === (type === "RECEIVABLE" ? "receber" : "pagar") ? null : value });
  const chipHref = (patch: Record<string, string | null>) => queryHref("/admin/finance", query, patch);

  return <div className="section-gap">
    <PageHeader
      eyebrow="Fluxo financeiro"
      title="Contas a pagar e receber"
      description="Contas e liquidações geradas automaticamente pelas operações do sistema. Como a SEFAZ não informa pagamentos, a baixa das duplicatas é registrada manualmente."
      actions={!!batchPayables.length && <Modal trigger={<><ListChecks size={16}/>Baixa em lote</>} triggerClassName="btn btn-primary" size="lg" title="Baixa em lote" description="Marque as duplicatas de NF-e que serão liquidadas. O saldo integral de cada parcela é baixado com a mesma forma e data.">
        <ActionForm action={financialBatchSettlementAction} submitLabel="Dar baixa nas selecionadas" className="grid gap-4 sm:grid-cols-2">
          <BatchPicker options={batchPayables.map((row) => ({ id: row.installment_id, title: row.counterparty_name, detail: `${row.source_reference ? `Duplicata ${row.source_reference}` : `Parcela ${row.installment_number}`} · vence ${formatDueDate(row.due_date)}`, cents: row.amount_cents - row.settled_cents }))}/>
          <label className="label">Data e hora<input className="field" type="datetime-local" name="occurredAt" defaultValue={occurredAt} required/></label>
          <label className="label">Forma de pagamento<select className="field" name="methodCode">{paymentMethods.rows.map((method) => <option key={method.code} value={method.code}>{method.name}</option>)}</select></label>
          <label className="label sm:col-span-2">Observação<input className="field" name="notes"/></label>
        </ActionForm>
      </Modal>}
    />

    <section className="stat-grid" aria-label="Resumo do filtro">
      <StatCard icon={Receipt} label="Parcelas encontradas" value={installments.rows.length}/>
      <StatCard tone="info" icon={Wallet} label="Saldo em aberto filtrado" value={formatMoney(filteredBalance)}/>
      <StatCard tone={overdueCount ? "danger" : undefined} icon={AlertCircle} label="Vencidas no resultado" value={overdueCount} hint={overdueCount ? "Priorize estas baixas" : "Nada em atraso"} hintTone={overdueCount ? "danger" : undefined}/>
    </section>

    <FilterBar clearHref="/admin/finance" hasFilters={hasFilters}>
      <div className="toolbar-row chip-row">
        <Chips label="Vencimento" items={[
          { label: "Qualquer", href: chipHref({ due: null }), active: due === "ALL" },
          { label: "Em atraso", href: chipHref({ due: "OVERDUE" }), active: due === "OVERDUE", count: dueCounts.rows[0].overdue, tone: "danger" },
          { label: "Hoje", href: chipHref({ due: "TODAY" }), active: due === "TODAY", count: dueCounts.rows[0].today },
          { label: "7 dias", href: chipHref({ due: "NEXT_7" }), active: due === "NEXT_7", count: dueCounts.rows[0].next7 },
          { label: "30 dias", href: chipHref({ due: "NEXT_30" }), active: due === "NEXT_30", count: dueCounts.rows[0].next30 },
        ]}/>
        <Chips label="Tipo" items={[
          { label: "Todos", href: chipHref({ type: null }), active: !type },
          { label: "A pagar", href: chipHref({ type: "PAYABLE" }), active: type === "PAYABLE" },
          { label: "A receber", href: chipHref({ type: "RECEIVABLE" }), active: type === "RECEIVABLE" },
        ]}/>
      </div>
      <SearchField defaultValue={q} label="Busca geral" placeholder="Descrição, pessoa, número da NF-e ou duplicata"/>
      <label className="toolbar-field">Fornecedor<input className="field" name="supplier" list="finance-suppliers" defaultValue={supplier} placeholder="Nome ou CNPJ"/><datalist id="finance-suppliers">{suppliers.rows.map((row) => <option value={row.counterparty_name} key={row.counterparty_name}/>)}</datalist></label>
      <label className="toolbar-field">Status<select className="field" name="status" defaultValue={status}><option value="">Todos</option><option value="OPEN">Aberta</option><option value="PARTIAL">Parcial</option><option value="SETTLED">Liquidada</option><option value="CANCELED">Cancelada</option></select></label>
      <MoreFilters active={advancedActive} label="Datas e valores">
        <label className="toolbar-field">Vencimento inicial<input className="field" type="date" name="from" defaultValue={from ?? ""}/></label>
        <label className="toolbar-field">Vencimento final<input className="field" type="date" name="to" defaultValue={to ?? ""}/></label>
        <label className="toolbar-field">Saldo mínimo (R$)<input className="field" name="min" inputMode="decimal" defaultValue={query.min ?? ""} placeholder="0,00"/></label>
        <label className="toolbar-field">Saldo máximo (R$)<input className="field" name="max" inputMode="decimal" defaultValue={query.max ?? ""} placeholder="0,00"/></label>
      </MoreFilters>
    </FilterBar>

    <Tabs label="Visões financeiras" items={[
      { href: tabHref("pagar"), label: "A pagar", active: tab === "pagar", count: openPayables.length },
      { href: tabHref("receber"), label: "A receber", active: tab === "receber", count: receivables.length },
      { href: tabHref("liquidacoes"), label: "Liquidações", active: tab === "liquidacoes" },
      { href: tabHref("conciliacao"), label: "Conciliação bancária", active: tab === "conciliacao" },
    ]}/>

    {tab === "pagar" && <section className="grid grid-cols-1 gap-4">
      <div><h2 className="text-lg font-bold">Duplicatas por fornecedor</h2><p className="text-sm muted">Contas a pagar agrupadas pela empresa emitente. Use “Dar baixa” para registrar pagamentos totais ou parciais.</p></div>
      {supplierGroups.map((group) => <details className="card disclosure" key={group.key} open={group.openCents > 0 || undefined}>
        <summary>
          <span className="cell-main"><h3 className="panel-title">{group.supplier}</h3><small>{group.document && `${formatDocument(group.document)} · `}{group.rows.length} duplicata(s)</small></span>
          <span className="flex items-center gap-4"><span className="cell-main num"><small>Saldo em aberto</small><b className="text-lg">{formatMoney(group.openCents)}</b></span>
            <svg className="disclosure-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
        </summary>
        <InstallmentTable rows={group.rows} today={today} paymentMethods={paymentMethods.rows} occurredAt={occurredAt} allowSettlement/>
      </details>)}
      {!supplierGroups.length && <div className="card"><EmptyState icon={Banknote} title="Nenhuma duplicata a pagar" description={hasFilters ? "Nada encontrado com os filtros atuais." : "As duplicatas das NF-e de compra aparecem aqui automaticamente."}/></div>}
    </section>}

    {tab === "receber" && <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">Contas a receber</h2><p className="panel-desc">Vendas com pagamento futuro e outros valores a receber.</p></div></div>
      {receivables.length ? <InstallmentTable rows={receivables} today={today} showSupplier/> : <EmptyState icon={Banknote} title="Nenhuma conta a receber" description={hasFilters ? "Nada encontrado com os filtros atuais." : "Pagamentos futuros feitos no PDV aparecem aqui."}/>}
    </section>}

    {tab === "liquidacoes" && settlements && <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">Últimas liquidações</h2><p className="panel-desc">Até 100 registros mais recentes. Estornar recalcula os saldos das parcelas.</p></div></div>
      {settlements.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Pessoa</th><th>Forma</th><th className="num">Valor</th><th>Observação</th><th className="col-actions"><span className="sr-only">Ação</span></th></tr></thead>
        <tbody>{settlements.rows.map((row) => <tr key={row.id} className={row.reversed_at ? "opacity-60" : ""}>
          <td><DateTimeCell value={row.occurred_at}/></td>
          <td className="cell-wrap"><span className="cell-main"><b>{row.description}</b><small>{row.reversed_at ? "Estornada" : label(row.type)}</small></span></td>
          <td className="cell-wrap">{row.person_name || row.counterparty_name}</td>
          <td>{row.method_name}</td>
          <td className="num"><b>{formatMoney(row.amount_cents)}</b></td>
          <td className="cell-wrap muted">{row.reversal_reason || row.notes || "—"}</td>
          <td className="col-actions">{row.reversed_at ? <Badge tone="neutral">Estornada</Badge> : <Modal trigger="Estornar" triggerClassName="btn btn-danger btn-sm" size="sm" title="Estornar baixa" description={`${row.description} · ${formatMoney(row.amount_cents)}`}>
            <ActionForm action={financialReversalAction} submitLabel="Estornar baixa" submitVariant="danger-solid" className="grid gap-4">
              <input type="hidden" name="settlementId" value={row.id}/>
              <label className="label">Motivo do estorno<input className="field" name="reason" minLength={5} placeholder="Motivo obrigatório" required/></label>
            </ActionForm>
          </Modal>}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon={Receipt} title="Nenhuma liquidação registrada" description="As baixas de duplicatas e recebimentos aparecem aqui."/>}
    </section>}

    {tab === "conciliacao" && settlements && bankTransactions && <section className="grid grid-cols-1 gap-4">
      <ActionForm action={ofxImportAction} submitLabel="Importar OFX" className="card form-section sm:grid-cols-[1fr_auto] items-end">
        <div className="form-section-head sm:col-span-2"><h2>Conciliação bancária</h2><p>Importe OFX/QFX e vincule cada débito ou crédito à baixa correspondente.</p></div>
        <label className="label">Arquivo OFX<input className="field" type="file" name="file" accept=".ofx,.qfx,application/x-ofx" required/></label>
      </ActionForm>
      {bankTransactions.rowCount ? <div className="card table-wrap"><table>
        <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th><th>Conciliação</th></tr></thead>
        <tbody>{bankTransactions.rows.map((transaction) => {
          const candidates = settlements.rows.filter((settlement) => !settlement.reversed_at && settlement.amount_cents === Math.abs(transaction.amount_cents) && ((settlement.type === "PAYABLE") === (transaction.amount_cents < 0)));
          return <tr key={transaction.id}>
            <td>{formatDueDate(transaction.occurred_on)}</td>
            <td className="cell-wrap">{transaction.memo || "—"}</td>
            <td className={`num ${transaction.amount_cents < 0 ? "neg" : "pos"}`}><b>{formatMoney(transaction.amount_cents)}</b></td>
            <td>{transaction.settlement_id ? <Badge tone="ok" dot>Conciliada</Badge> : candidates.length ? <ActionForm action={bankReconcileAction} submitLabel="Conciliar" inline className="flex flex-wrap items-center gap-2"><input type="hidden" name="transactionId" value={transaction.id}/><select className="field" name="settlementId">{candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.counterparty_name} · {formatDate(candidate.occurred_at)}</option>)}</select></ActionForm> : <span className="muted text-sm">Sem baixa de mesmo valor</span>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="card"><EmptyState icon={FileUp} title="Nenhuma transação importada" description="Importe um arquivo OFX/QFX do seu banco para conciliar."/></div>}
    </section>}
  </div>;
}
