import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Plus, ShoppingBag, UserPlus, X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { CompletePlayerForm } from "@/components/comandas/complete-player-form";
import { CounterAddItem } from "@/components/comandas/counter-add-item";
import { NewOrdersWatcher } from "@/components/comandas/new-orders-watcher";
import { OpenComandaForm } from "@/components/comandas/open-comanda-form";
import { ReasonModal } from "@/components/comandas/reason-modal";
import { Modal } from "@/components/modal";
import { Badge, DateTimeCell, EmptyState, PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { cancelItemAction, cancelOrderAction, cancelSessionAction, deliverOrderAction } from "@/modules/comandas/actions";
import { eventLabel, orderStatusLabel, reasonLabel } from "@/modules/comandas/labels";
import { getSessionDetail, listComandaEvents, listNewOrders, openSessionOf, type EventRow } from "@/modules/comandas/service";

export const dynamic = "force-dynamic";

const tone = { NEW: "warn", DELIVERED: "ok", CANCELED: "danger" } as const;

function where(event: EventRow) {
  if (event.actor_name) return event.actor_name;
  const info = event.device_info ?? {};
  const device = [info.model, info.os, info.browser].filter(Boolean).join(" · ");
  return `Cliente${device ? ` (${device})` : ""}${event.ip ? ` · ${event.ip}` : ""}`;
}

export default async function ComandaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(permissions.CASH_MANAGE);
  const { id } = await params;
  const comanda = (await pool.query<{ id: string; number: number; active: boolean }>("SELECT id,number,active FROM comandas WHERE id=$1", [id])).rows[0];
  if (!comanda) notFound();
  const sessionId = await openSessionOf(id);
  const detail = sessionId ? await getSessionDetail(sessionId) : null;
  const header = (description: string) => <PageHeader back={{ href: "/admin/comandas", label: "Comandas" }} eyebrow="Operação" title={`Comanda ${comanda.number}`} description={description}/>;

  if (!detail) {
    const last = (await pool.query<{ id: string; status: string; opened_at: Date; closed_at: Date | null; sale_id: number | null; player_id: string; player_name: string; phone: string | null; email: string | null; provisional: boolean; cancel_reason: string | null }>(`SELECT s.id,s.status,s.opened_at,s.closed_at,s.sale_id,s.cancel_reason,p.id player_id,p.name player_name,p.phone,p.email,p.provisional
      FROM comanda_sessions s JOIN players p ON p.id=s.player_id WHERE s.comanda_id=$1 ORDER BY s.opened_at DESC LIMIT 5`, [id])).rows;
    const pending = last.find((session) => session.status === "CLOSED" && session.provisional);
    return <div className="section-gap">
      {header("Comanda livre. Abra para um cliente para receber pedidos.")}
      {pending && <section className="card guide-card" aria-label="Completar cadastro">
        <div className="panel-head"><div><h2 className="panel-title">Complete o cadastro de {pending.player_name}</h2><p className="panel-desc">A conta foi cobrada, mas o cliente ficou com cadastro provisório (só o nome). Aproveite para registrar os dados dele.</p></div>
          <Modal trigger={<><UserPlus size={15}/>Completar cadastro</>} triggerClassName="btn btn-primary btn-sm" title="Completar cadastro" description={`Cliente da comanda ${comanda.number}`}>
            <CompletePlayerForm playerId={pending.player_id} sessionId={pending.id} name={pending.player_name} phone={pending.phone} email={pending.email}/>
          </Modal></div>
      </section>}
      {comanda.active
        ? <section className="card p-5 grid gap-3"><h2 className="panel-title">Abrir comanda {comanda.number}</h2><OpenComandaForm comandaId={comanda.id}/></section>
        : <p className="notice-warn">Esta comanda está desativada. Reative em Cadastro para usá-la.</p>}
      {last.length > 0 && <section className="card"><div className="panel-head"><h2 className="panel-title">Últimos atendimentos</h2></div><div className="table-wrap"><table>
        <thead><tr><th>Cliente</th><th>Aberta</th><th>Encerrada</th><th>Situação</th></tr></thead>
        <tbody>{last.map((session) => <tr key={session.id}>
          <td>{session.player_name}{session.provisional && <> <Badge tone="info">Provisório</Badge></>}</td>
          <td>{formatDateTime(session.opened_at)}</td><td>{session.closed_at ? formatDateTime(session.closed_at) : "—"}</td>
          <td>{session.status === "CLOSED" ? <Badge tone="ok" dot>Cobrada{session.sale_id ? ` · venda ${session.sale_id}` : ""}</Badge> : <Badge tone="neutral" dot>Cancelada{session.cancel_reason ? ` · ${session.cancel_reason}` : ""}</Badge>}</td>
        </tr>)}</tbody></table></div></section>}
    </div>;
  }

  const [events, fresh] = await Promise.all([listComandaEvents({ sessionId: detail.id }, 1, 40), listNewOrders()]);
  const activeItems = detail.orders.flatMap((order) => order.items).filter((item) => !item.canceled_at).length;

  return <div className="section-gap">
    {header(`Aberta para ${detail.player_name} desde ${formatDateTime(detail.opened_at)}, por ${detail.opened_by_name}.`)}
    <NewOrdersWatcher initialIds={fresh.map((order) => order.id)}/>

    <section className="card comanda-summary">
      <div><p className="page-eyebrow">Cliente</p><h2 className="panel-title">{detail.player_name} {detail.provisional && <Badge tone="info">Cadastro provisório</Badge>}</h2>
        {detail.provisional && <p className="panel-desc">Só o nome foi informado. Você pode completar o cadastro agora ou ao cobrar a conta.</p>}</div>
      <div className="comanda-total"><span>Total da conta</span><strong>{formatMoney(detail.totalCents)}</strong></div>
      <div className="page-actions">
        <Modal trigger={<><Plus size={15}/>Lançar item</>} triggerClassName="btn btn-ghost" title="Lançar item" description={`Comanda ${comanda.number} · ${detail.player_name}`}><CounterAddItem sessionId={detail.id}/></Modal>
        {detail.provisional && <Modal trigger={<><UserPlus size={15}/>Completar cadastro</>} triggerClassName="btn btn-ghost" title="Completar cadastro" description={`Cliente da comanda ${comanda.number}`}>
          <CompletePlayerForm playerId={detail.player_id} sessionId={detail.id} name={detail.player_name} phone={detail.player_phone} email={detail.player_email}/></Modal>}
        {activeItems > 0
          ? <Link className="btn btn-success" href={`/pdv?comanda=${detail.id}`}><ShoppingBag size={16}/>Cobrar no PDV</Link>
          : <ReasonModal trigger={<><X size={15}/>Cancelar comanda</>} title="Cancelar comanda" description="Use quando a comanda foi aberta por engano ou o cliente foi embora sem pedir." action={cancelSessionAction} fields={{ sessionId: detail.id }} submitLabel="Cancelar comanda"/>}
      </div>
    </section>

    {detail.orders.length === 0
      ? <EmptyState icon={ShoppingBag} title="Nenhum pedido ainda" description="Os pedidos que o cliente fizer pelo celular aparecem aqui na hora. Você também pode lançar itens pelo botão acima."/>
      : <section className="grid gap-3" aria-label="Pedidos">{[...detail.orders].reverse().map((order) => <article key={order.id} className={`card order-card is-${order.status.toLowerCase()}`}>
        <header className="order-head">
          <div><b>{order.source === "CUSTOMER" ? "Pedido do cliente" : `Lançado por ${order.created_by_name ?? "balcão"}`}</b><small><DateTimeCell value={order.created_at}/></small></div>
          <div className="order-head-actions">
            <Badge tone={tone[order.status]} dot>{orderStatusLabel[order.status]}</Badge>
            {order.status === "NEW" && <ActionForm action={deliverOrderAction} inline submitLabel="Marcar entregue" submitVariant="success" className="inline-form"><input type="hidden" name="orderId" value={order.id}/></ActionForm>}
            {order.status !== "CANCELED" && <ReasonModal trigger="Cancelar pedido" title="Cancelar pedido" description="Os itens saem da conta do cliente." action={cancelOrderAction} fields={{ orderId: order.id }} submitLabel="Cancelar pedido"/>}
          </div>
        </header>
        <ul className="order-items">{order.items.map((item) => <li key={item.id} className={item.canceled_at ? "is-canceled" : ""}>
          <span>{item.quantity}× {item.product_name}</span><span>{formatMoney(item.unit_price_cents * item.quantity)}</span>
          {!item.canceled_at && order.status !== "CANCELED" && <ReasonModal trigger={<X size={14}/>} triggerClassName="btn btn-ghost btn-sm btn-icon" title="Cancelar item" description={`${item.quantity}× ${item.product_name}`} action={cancelItemAction} fields={{ itemId: item.id }} submitLabel="Cancelar item"/>}
          {item.canceled_at && <small>cancelado{item.cancel_reason ? `: ${item.cancel_reason}` : ""}</small>}
        </li>)}</ul>
        {order.note && <p className="order-note">Observação: {order.note}</p>}
      </article>)}</section>}

    <section className="card" aria-label="Auditoria desta comanda">
      <div className="panel-head"><div><h2 className="panel-title">Histórico desta comanda</h2><p className="panel-desc">Tudo o que aconteceu nela, com quem fez, quando e de onde.</p></div><BadgeCheck size={18}/></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Quando</th><th>O quê</th><th>Quem</th><th>Resultado</th></tr></thead>
        <tbody>{events.map((event) => <tr key={event.id}>
          <td><DateTimeCell value={event.created_at}/></td>
          <td>{eventLabel[event.type as keyof typeof eventLabel] ?? event.type}{typeof event.details?.reason === "string" && <small className="block muted">{reasonLabel[event.details.reason] ?? event.details.reason}</small>}</td>
          <td className="cell-wrap">{where(event)}{event.distance_meters !== null && <small className="block muted">a {event.distance_meters} m da loja{event.accuracy_meters ? ` (±${Math.round(event.accuracy_meters)} m)` : ""}</small>}</td>
          <td><Badge tone={event.outcome === "OK" ? "ok" : "danger"} dot>{event.outcome === "OK" ? "Ok" : "Barrado"}</Badge></td>
        </tr>)}</tbody></table></div>
    </section>
  </div>;
}
