import Link from "next/link";
import { HandCoins, History, Pencil, Plus, UserRound, Users } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { FilterBar, SearchField } from "@/components/filter-bar";
import { MaskedInput } from "@/components/masked-input";
import { Modal } from "@/components/modal";
import { Badge, Chips, DateTimeCell, EmptyState, PageHeader, StatCard, Tabs } from "@/components/ui";
import { pool } from "@/db";
import { formatMoney } from "@/lib/money";
import { queryHref } from "@/lib/query-string";
import { playerAction, playerCreditAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";
const PLAYER_LIMIT = 200;
const movementLabel = (value: string) => ({ MANUAL: "Ajuste manual", SALE_CREDIT: "Crédito usado no PDV", FUTURE_CHARGE: "Pagamento futuro", FUTURE_PAYMENT: "Recebimento", SALE_REVERSAL: "Estorno de venda" }[value] ?? value);

type Player = { id: string; name: string; email: string | null; phone: string | null; notes: string | null; credit_balance_cents: number; active: boolean };

function PlayerFields({ player }: { player?: Player }) {
  return <>
    {player && <input type="hidden" name="id" value={player.id}/>}
    <label className="label">Nome<input className="field" name="name" defaultValue={player?.name} required/></label>
    <label className="label">E-mail<input className="field" type="email" name="email" defaultValue={player?.email ?? ""}/></label>
    <label className="label">Telefone<MaskedInput kind="phone" name="phone" defaultValue={player?.phone}/></label>
    {player && <label className="label">Status<select className="field" name="active" defaultValue={String(player.active)}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>}
    <label className="label sm:col-span-2">Observações<input className="field" name="notes" defaultValue={player?.notes ?? ""}/></label>
  </>;
}

export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const tab = query.tab === "extrato" ? "extrato" : "jogadores";
  const q = query.q?.trim().slice(0, 120) ?? "";
  const balance = query.balance === "credit" || query.balance === "debt" ? query.balance : "";
  const status = query.status === "active" || query.status === "inactive" ? query.status : "";
  const playerFilter = query.player ?? "";

  const [totals, players, movements] = await Promise.all([
    pool.query<{ total: number; active_count: number; credit_cents: number; debt_cents: number }>("SELECT count(*)::int total,count(*) FILTER (WHERE active)::int active_count,COALESCE(sum(credit_balance_cents) FILTER (WHERE active AND credit_balance_cents>0),0)::float8 credit_cents,ABS(COALESCE(sum(credit_balance_cents) FILTER (WHERE active AND credit_balance_cents<0),0))::float8 debt_cents FROM players"),
    tab === "jogadores" ? pool.query<Player>(`SELECT id,name,email,phone,notes,credit_balance_cents,active FROM players
      WHERE ($1='' OR name ILIKE $2 OR COALESCE(email,'') ILIKE $2 OR COALESCE(phone,'') ILIKE $2)
        AND ($3='' OR ($3='credit' AND credit_balance_cents>0) OR ($3='debt' AND credit_balance_cents<0))
        AND ($4='' OR ($4='active' AND active) OR ($4='inactive' AND NOT active))
      ORDER BY active DESC,name LIMIT ${PLAYER_LIMIT}`, [q, `%${q}%`, balance, status]) : null,
    tab === "extrato" ? pool.query<{ id: string; player_name: string; type: string; amount_cents: number; balance_after_cents: number; sale_id: number | null; notes: string | null; created_at: Date }>(`SELECT m.id,p.name player_name,m.type,m.amount_cents,m.balance_after_cents,m.sale_id,m.notes,m.created_at FROM player_credit_movements m JOIN players p ON p.id=m.player_id
      WHERE ($1='' OR p.name ILIKE $2) AND ($3='' OR m.player_id::text=$3) ORDER BY m.created_at DESC LIMIT 200`, [q, `%${q}%`, playerFilter]) : null,
  ]);
  const summary = totals.rows[0];
  const hasFilters = Boolean(q || balance || status);

  return <div className="section-gap">
    <PageHeader
      eyebrow="Relacionamento"
      title="Jogadores e créditos"
      description="Saldo positivo é crédito; saldo negativo representa valor devido pelo jogador."
      actions={<Modal trigger={<><Plus size={16}/>Novo jogador</>} triggerClassName="btn btn-success" title="Novo jogador" description="Depois de cadastrado, o jogador pode usar crédito e pagamento futuro no PDV.">
        <ActionForm action={playerAction} className="grid gap-4 sm:grid-cols-2"><PlayerFields/></ActionForm>
      </Modal>}
    />

    <section className="stat-grid" aria-label="Resumo de jogadores">
      <StatCard icon={Users} label="Jogadores cadastrados" value={summary.total} hint={`${summary.active_count} ativo(s)`}/>
      <StatCard tone="info" icon={HandCoins} label="Créditos em aberto" value={formatMoney(summary.credit_cents)} hint="Saldo a favor dos jogadores ativos" href={queryHref("/admin/players", {}, { balance: "credit" })}/>
      <StatCard tone={summary.debt_cents ? "warn" : undefined} icon={HandCoins} label="Dívidas em aberto" value={formatMoney(summary.debt_cents)} hint="Valores a receber dos jogadores ativos" href={queryHref("/admin/players", {}, { balance: "debt" })}/>
    </section>

    <Tabs label="Visões de jogadores" items={[
      { href: "/admin/players", label: "Jogadores", active: tab === "jogadores" },
      { href: "/admin/players?tab=extrato", label: "Extrato de créditos", active: tab === "extrato" },
    ]}/>

    {players && <>
      <FilterBar clearHref="/admin/players" hasFilters={hasFilters}>
        <SearchField defaultValue={q} placeholder="Nome, e-mail ou telefone"/>
        <Chips label="Saldo" items={[
          { label: "Todos", href: queryHref("/admin/players", query, { balance: null }), active: !balance },
          { label: "Com crédito", href: queryHref("/admin/players", query, { balance: "credit" }), active: balance === "credit" },
          { label: "Devendo", href: queryHref("/admin/players", query, { balance: "debt" }), active: balance === "debt" },
        ]}/>
        <label className="toolbar-field">Cadastro<select className="field" name="status" defaultValue={status}><option value="">Ativos e inativos</option><option value="active">Somente ativos</option><option value="inactive">Somente inativos</option></select></label>
      </FilterBar>
      <section className="card">
        {players.rowCount ? <div className="table-wrap"><table>
          <thead><tr><th>Jogador</th><th>Contato</th><th className="num">Saldo</th><th>Status</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{players.rows.map((player) => <tr key={player.id}>
            <td className="cell-wrap"><span className="cell-main"><b>{player.name}</b>{player.notes && <small>{player.notes}</small>}</span></td>
            <td className="cell-wrap"><span className="cell-main"><span>{player.email || <span className="muted">Sem e-mail</span>}</span><small>{player.phone || "Sem telefone"}</small></span></td>
            <td className="num"><span className="cell-main"><b className={player.credit_balance_cents < 0 ? "neg" : player.credit_balance_cents > 0 ? "pos" : ""}>{formatMoney(player.credit_balance_cents)}</b><small>{player.credit_balance_cents < 0 ? "em dívida" : player.credit_balance_cents > 0 ? "a favor" : "sem saldo"}</small></span></td>
            <td><Badge tone={player.active ? "ok" : "neutral"} dot>{player.active ? "Ativo" : "Inativo"}</Badge></td>
            <td className="col-actions"><div className="row-actions">
              <Modal trigger={<><HandCoins size={14}/>Movimentar</>} triggerClassName="btn btn-ghost btn-sm" size="sm" title="Movimentar crédito" description={`${player.name} · saldo atual ${formatMoney(player.credit_balance_cents)}`}>
                <ActionForm action={playerCreditAction} submitLabel="Registrar movimentação" className="grid gap-4">
                  <input type="hidden" name="playerId" value={player.id}/>
                  <label className="label">Operação<select className="field" name="direction"><option value="CREDIT">Adicionar crédito</option><option value="DEBIT">Debitar / criar dívida</option></select></label>
                  <label className="label">Valor (R$)<input className="field" name="amount" inputMode="decimal" placeholder="0,00" required/></label>
                  <label className="label">Motivo<input className="field" name="reason" required placeholder="Ex.: pré-pagamento, ajuste de torneio"/></label>
                </ActionForm>
              </Modal>
              <Modal trigger={<><Pencil size={14}/>Editar</>} triggerClassName="btn btn-ghost btn-sm" title="Editar jogador" description={player.name}>
                <ActionForm action={playerAction} className="grid gap-4 sm:grid-cols-2"><PlayerFields player={player}/></ActionForm>
              </Modal>
              <Link className="btn btn-ghost btn-sm btn-icon" href={queryHref("/admin/players", {}, { tab: "extrato", player: player.id })} title="Ver extrato deste jogador" aria-label={`Extrato de ${player.name}`}><History size={15}/></Link>
            </div></td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon={UserRound} title="Nenhum jogador encontrado" description={hasFilters ? "Nenhum jogador corresponde aos filtros aplicados." : "Cadastre o primeiro jogador para habilitar crédito e pagamento futuro."}/>}
        {players.rowCount === PLAYER_LIMIT && <p className="panel-note">Exibindo os primeiros {PLAYER_LIMIT} jogadores. Use a busca para localizar os demais.</p>}
      </section>
    </>}

    {movements && <>
      <FilterBar clearHref="/admin/players?tab=extrato" hasFilters={Boolean(q || playerFilter)}>
        <SearchField defaultValue={q} placeholder="Nome do jogador" label="Jogador"/>
        {playerFilter && <p className="notice-info">Exibindo o extrato de um jogador específico. <Link className="link" href={queryHref("/admin/players", query, { player: null })}>Ver todos</Link></p>}
      </FilterBar>
      <section className="card">
        <div className="panel-head"><div><h2 className="panel-title">Extrato de créditos</h2><p className="panel-desc">Últimas 200 movimentações.</p></div></div>
        {movements.rowCount ? <div className="table-wrap"><table>
          <thead><tr><th>Data</th><th>Jogador</th><th>Tipo</th><th>Venda</th><th className="num">Movimento</th><th className="num">Saldo após</th><th>Observação</th></tr></thead>
          <tbody>{movements.rows.map((movement) => <tr key={movement.id}>
            <td><DateTimeCell value={movement.created_at}/></td>
            <td className="cell-wrap"><b>{movement.player_name}</b></td>
            <td><Badge>{movementLabel(movement.type)}</Badge></td>
            <td className="mono">{movement.sale_id ? `VEN-${String(movement.sale_id).padStart(6, "0")}` : "—"}</td>
            <td className={`num ${movement.amount_cents < 0 ? "neg" : "pos"}`}><b>{movement.amount_cents > 0 ? "+" : ""}{formatMoney(movement.amount_cents)}</b></td>
            <td className="num">{formatMoney(movement.balance_after_cents)}</td>
            <td className="cell-wrap muted">{movement.notes || "—"}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon={History} title="Nenhuma movimentação" description="Créditos, dívidas e estornos dos jogadores aparecem aqui."/>}
      </section>
    </>}
  </div>;
}
