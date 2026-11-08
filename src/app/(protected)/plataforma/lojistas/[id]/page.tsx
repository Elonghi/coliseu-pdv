import { notFound } from "next/navigation";
import { KeyRound, Pause, Pencil, Play, Plus, Store } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { Badge, DateTimeCell, EmptyState, PageHeader } from "@/components/ui";
import { requirePlatformAdmin } from "@/modules/auth/session";
import { addStoreAction, resetOwnerPasswordAction, setAccountActiveAction, updateAccountAction, updateStoreAction } from "@/modules/platform/actions";
import { asPlatform, getAccount, type StoreRow } from "@/modules/platform/service";

export const dynamic = "force-dynamic";

function StoreFields({ accountId, store }: { accountId: string; store?: StoreRow }) {
  return <>
    <input type="hidden" name="accountId" value={accountId}/>
    {store && <input type="hidden" name="storeId" value={store.id}/>}
    <label className="label">Nome da loja<input className="field" name="name" defaultValue={store?.name} required/></label>
    <label className="label">CNPJ (opcional)<input className="field" name="cnpj" defaultValue={store?.cnpj ?? ""} placeholder="Somente números ou letras"/><span className="field-hint">Com o CNPJ, as notas fiscais emitidas para ele entram nesta loja.</span></label>
    {store && <label className="switch"><input type="checkbox" name="active" value="true" defaultChecked={store.active}/><span>Loja ativa<small>Lojas inativas somem do seletor e não aceitam vendas.</small></span></label>}
  </>;
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asPlatform(() => getAccount(id));
  if (!data) notFound();
  const { account, stores, team } = data;
  const atLimit = account.max_stores !== null && stores.length >= account.max_stores;

  return <div className="section-gap">
    <PageHeader
      back={{ href: "/plataforma", label: "Lojistas" }}
      eyebrow="Lojista"
      title={account.name}
      description={<><Badge tone={account.active ? "ok" : "warn"} dot>{account.active ? "Ativo" : "Suspenso"}</Badge> · cliente desde <DateTimeCell value={account.created_at}/></>}
      actions={<>
        <Modal trigger={<><Pencil size={15}/>Editar dados</>} triggerClassName="btn btn-ghost" size="sm" title="Dados do lojista" description="Nome, observações internas e limite de lojas.">
          <ActionForm action={updateAccountAction} className="grid gap-4">
            <input type="hidden" name="accountId" value={account.id}/>
            <label className="label">Nome<input className="field" name="name" defaultValue={account.name} required/></label>
            <label className="label">Limite de lojas<input className="field" name="maxStores" type="number" min="1" defaultValue={account.max_stores ?? ""} placeholder="Sem limite"/><span className="field-hint">Hoje: {stores.length} loja(s). Vazio = sem limite.</span></label>
            <label className="label">Observações internas<input className="field" name="notes" defaultValue={account.notes ?? ""}/></label>
          </ActionForm>
        </Modal>
        <Modal trigger={<><KeyRound size={15}/>Senha do titular</>} triggerClassName="btn btn-ghost" size="sm" title="Redefinir senha do titular" description="Define uma senha provisória e encerra as sessões abertas dele.">
          <ActionForm action={resetOwnerPasswordAction} submitLabel="Definir senha" className="grid gap-4">
            <input type="hidden" name="accountId" value={account.id}/>
            <label className="label">Nova senha provisória<input className="field" type="password" name="password" minLength={10} required autoComplete="new-password"/><span className="field-hint">Mínimo de 10 caracteres. Também desliga a autenticação em duas etapas, para ele poder entrar.</span></label>
          </ActionForm>
        </Modal>
        <Modal trigger={account.active ? <><Pause size={15}/>Suspender</> : <><Play size={15}/>Reativar</>} triggerClassName={`btn ${account.active ? "btn-danger" : "btn-success"}`} size="sm" title={account.active ? "Suspender lojista" : "Reativar lojista"} description={account.active ? "Ninguém deste lojista consegue entrar enquanto estiver suspenso. Os dados ficam guardados." : "Libera de novo o acesso de toda a equipe."}>
          <ActionForm action={setAccountActiveAction} submitLabel={account.active ? "Suspender agora" : "Reativar"} submitVariant={account.active ? "danger-solid" : "success"} className="grid gap-4">
            <input type="hidden" name="accountId" value={account.id}/>
            <input type="hidden" name="active" value={account.active ? "false" : "true"}/>
            <p className="notice-info">{account.active ? `As sessões abertas de ${team.length} pessoa(s) serão encerradas.` : "O acesso volta imediatamente."}</p>
          </ActionForm>
        </Modal>
      </>}
    />

    <section className="card">
      <div className="panel-head">
        <div><h2 className="panel-title">Lojas</h2><p className="panel-desc">{stores.length} loja(s){account.max_stores !== null ? ` de um limite de ${account.max_stores}` : ", sem limite"}. O titular enxerga todas.</p></div>
        <Modal trigger={<><Plus size={15}/>Adicionar loja</>} triggerClassName="btn btn-success btn-sm" size="sm" title="Adicionar loja" description={`Nova loja de ${account.name}.`}>
          <ActionForm action={addStoreAction} submitLabel="Adicionar loja" className="grid gap-4"><StoreFields accountId={account.id}/></ActionForm>
        </Modal>
      </div>
      {atLimit && <p className="notice-info panel-note">O lojista está no limite de lojas. Para adicionar outra, aumente o limite em Editar dados.</p>}
      {stores.length ? <div className="table-wrap"><table>
        <thead><tr><th>Loja</th><th>CNPJ</th><th>Status</th><th>Desde</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{stores.map((store) => <tr key={store.id}>
          <td className="cell-wrap"><b>{store.name}</b></td>
          <td className="mono">{store.cnpj ?? <span className="muted">Não informado</span>}</td>
          <td><Badge tone={store.active ? "ok" : "neutral"} dot>{store.active ? "Ativa" : "Inativa"}</Badge></td>
          <td><DateTimeCell value={store.created_at}/></td>
          <td className="col-actions"><Modal trigger={<><Pencil size={14}/>Editar</>} triggerClassName="btn btn-ghost btn-sm" size="sm" title="Editar loja" description={store.name}>
            <ActionForm action={updateStoreAction} className="grid gap-4"><StoreFields accountId={account.id} store={store}/></ActionForm>
          </Modal></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon={Store} title="Nenhuma loja" description="Adicione a primeira loja deste lojista."/>}
    </section>

    <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">Equipe</h2><p className="panel-desc">Quem tem acesso. O titular cadastra e libera a equipe dentro do painel dele.</p></div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Pessoa</th><th>Perfil</th><th>Status</th></tr></thead>
        <tbody>{team.map((person) => <tr key={person.id}>
          <td className="cell-wrap"><span className="cell-main"><b>{person.name}</b><small>{person.email}</small></span></td>
          <td><span className="row-actions"><Badge tone={person.role === "ADMIN" ? "info" : "neutral"}>{person.role === "ADMIN" ? "Administrador" : "Operador"}</Badge>{person.is_account_owner && <Badge tone="ok">Lojista</Badge>}</span></td>
          <td><Badge tone={person.active ? "ok" : "neutral"} dot>{person.active ? "Ativo" : "Inativo"}</Badge></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
