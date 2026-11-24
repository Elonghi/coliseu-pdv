import Link from "next/link";
import { ClipboardList, Plus, Receipt, Store, Users, Wallet } from "lucide-react";
import { ComandaTabs } from "@/components/comandas/comanda-tabs";
import { NewOrdersWatcher } from "@/components/comandas/new-orders-watcher";
import { OpenComandaForm } from "@/components/comandas/open-comanda-form";
import { Modal } from "@/components/modal";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { pool } from "@/db";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { anonymizeOldComandaData } from "@/modules/comandas/audit";
import { getComandaSettings, listComandas, listNewOrders } from "@/modules/comandas/service";

export const dynamic = "force-dynamic";

export default async function ComandasPage() {
  const user = await requirePermission(permissions.CASH_MANAGE);
  const isAdmin = user.role === "ADMIN";
  const header = <PageHeader eyebrow="Operação" title="Comandas" description="Abra a comanda para um cliente, acompanhe os pedidos que chegam pelo celular e cobre a conta no PDV."/>;
  if (user.consolidated) {
    return <div className="section-gap">{header}
      <EmptyState icon={Store} title="Escolha uma loja" description="As comandas são de cada loja. Escolha a loja no seletor do menu para abrir e acompanhar as comandas dela."/>
    </div>;
  }
  // Retenção da auditoria (LGPD): a anonimização roda de vez em quando, a partir de qualquer tela do balcão.
  void anonymizeOldComandaData(pool).catch((error) => console.error("[comanda] anonimização falhou", error));
  const [comandas, settings, fresh] = await Promise.all([listComandas(), getComandaSettings(), listNewOrders()]);
  const active = comandas.filter((comanda) => comanda.active);
  const open = active.filter((comanda) => comanda.session_id);
  const openTotal = open.reduce((sum, comanda) => sum + comanda.total_cents, 0);

  return <div className="section-gap">
    {header}
    <ComandaTabs active="board" isAdmin={isAdmin}/>
    {!settings.enabled && <p className="notice-warn">Os pedidos pelo celular estão <b>desligados</b> nesta loja: o cliente que escanear o QR vê um aviso. {isAdmin ? <Link className="link-row" href="/admin/comandas/configuracoes">Ligar em Configurações</Link> : "Peça ao administrador para ligar."}</p>}
    <NewOrdersWatcher initialIds={fresh.map((order) => order.id)}/>

    <section className="stat-grid" aria-label="Resumo das comandas">
      <StatCard icon={Receipt} label="Comandas abertas" value={open.length} hint={`${active.length} cadastrada(s)`}/>
      <StatCard icon={ClipboardList} tone={fresh.length ? "warn" : undefined} label="Pedidos novos" value={fresh.length} hint="Chegaram pelo celular e ainda não foram entregues"/>
      <StatCard icon={Wallet} tone="info" label="Em aberto" value={formatMoney(openTotal)} hint="Soma das contas abertas"/>
    </section>

    {active.length ? <section aria-label="Comandas" className="comanda-grid">
      {active.map((comanda) => comanda.session_id
        ? <Link key={comanda.id} href={`/admin/comandas/${comanda.id}`} className={`comanda-card is-open ${comanda.new_orders ? "has-new" : ""}`}>
          <span className="comanda-number">{comanda.number}</span>
          <span className="comanda-body">
            <b>{comanda.player_name}</b>
            <small>Aberta {comanda.opened_at ? formatDateTime(comanda.opened_at) : ""}</small>
            <span className="comanda-foot"><strong>{formatMoney(comanda.total_cents)}</strong>
              {comanda.new_orders > 0 && <Badge tone="warn" dot>{comanda.new_orders} novo(s)</Badge>}
              {comanda.provisional && <Badge tone="info">Provisório</Badge>}
            </span>
          </span>
        </Link>
        : <div key={comanda.id} className="comanda-card is-free">
          <span className="comanda-number">{comanda.number}</span>
          <span className="comanda-body">
            <b>Livre</b>
            <Modal trigger={<><Plus size={15}/>Abrir</>} triggerClassName="btn btn-primary btn-sm" size="sm" title={`Abrir comanda ${comanda.number}`} description="Vincule a comanda ao cliente. Os pedidos só entram com a comanda aberta.">
              <OpenComandaForm comandaId={comanda.id}/>
            </Modal>
          </span>
        </div>)}
    </section> : <EmptyState icon={Users} title="Nenhuma comanda cadastrada" description={isAdmin ? "Cadastre as comandas físicas (de 1 a 20, por exemplo) e imprima os QR Codes." : "Peça ao administrador para cadastrar as comandas."}
      action={isAdmin ? <Link className="btn btn-primary btn-sm" href="/admin/comandas/cadastro">Cadastrar comandas</Link> : undefined}/>}
  </div>;
}
