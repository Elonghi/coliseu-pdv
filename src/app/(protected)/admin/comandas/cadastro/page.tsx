import { Store } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { ComandaTabs } from "@/components/comandas/comanda-tabs";
import { Modal } from "@/components/modal";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/modules/auth/session";
import { createComandasAction, rotateQrAction, updateComandaAction } from "@/modules/comandas/actions";
import { listComandas } from "@/modules/comandas/service";

export const dynamic = "force-dynamic";

export default async function ComandaRegistrationPage() {
  const user = await requireUser("ADMIN");
  const header = <PageHeader eyebrow="Operação" title="Cadastro de comandas" description="Cadastre as comandas físicas da loja. Cada uma tem um número e um QR Code próprios."/>;
  if (user.consolidated) return <div className="section-gap">{header}<ComandaTabs active="cadastro" isAdmin/><EmptyState icon={Store} title="Escolha uma loja" description="As comandas são de cada loja. Escolha a loja no seletor do menu."/></div>;
  const comandas = await listComandas();

  return <div className="section-gap">
    {header}
    <ComandaTabs active="cadastro" isAdmin/>
    <ActionForm action={createComandasAction} inline submitLabel="Cadastrar" className="card flex flex-wrap items-end gap-3 p-4">
      <label className="label">Da comanda número<input className="field w-32" name="from" type="number" min={1} max={9999} defaultValue={comandas.length ? Math.max(...comandas.map((comanda) => comanda.number)) + 1 : 1} required/></label>
      <label className="label">Até (opcional)<input className="field w-32" name="to" type="number" min={1} max={9999} placeholder="Só esta"/></label>
      <p className="field-hint flex-1 min-w-56">Para cadastrar de 1 a 20, informe 1 e 20. Números que já existem são ignorados.</p>
    </ActionForm>

    <section className="card">
      <div className="panel-head"><h2 className="panel-title">{comandas.length} comanda(s)</h2></div>
      {comandas.length ? <div className="table-wrap"><table>
        <thead><tr><th>Número</th><th>Situação</th><th>QR Code</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{comandas.map((comanda) => <tr key={comanda.id}>
          <td><b>{comanda.number}</b></td>
          <td>{!comanda.active ? <Badge tone="neutral" dot>Desativada</Badge> : comanda.session_id ? <Badge tone="warn" dot>Aberta · {comanda.player_name}</Badge> : <Badge tone="ok" dot>Livre</Badge>}</td>
          <td>versão {comanda.token_version}</td>
          <td className="col-actions"><div className="row-actions">
            <Modal trigger="Editar" triggerClassName="btn btn-ghost btn-sm" size="sm" title={`Editar comanda ${comanda.number}`}>
              <ActionForm action={updateComandaAction} submitLabel="Salvar" className="grid gap-4">
                <input type="hidden" name="id" value={comanda.id}/>
                <label className="label">Número<input className="field" name="number" type="number" min={1} max={9999} defaultValue={comanda.number} required/></label>
                <label className="switch"><input type="checkbox" name="active" defaultChecked={comanda.active}/><span>Comanda ativa</span></label>
              </ActionForm>
            </Modal>
            <Modal trigger="Trocar QR" triggerClassName="btn btn-ghost btn-sm" size="sm" title={`Trocar o QR da comanda ${comanda.number}`} description="Use se a comanda for perdida ou fotografada.">
              <ActionForm action={rotateQrAction} submitLabel="Trocar QR Code" submitVariant="danger-solid" className="grid gap-4">
                <input type="hidden" name="id" value={comanda.id}/>
                <p className="notice-warn">O QR impresso <b>deixa de funcionar na hora</b>. Depois de trocar, imprima o novo em QR Codes e substitua a comanda física.</p>
              </ActionForm>
            </Modal>
          </div></td>
        </tr>)}</tbody></table></div> : <EmptyState title="Nenhuma comanda ainda" description="Use o formulário acima para cadastrar a primeira."/>}
    </section>
  </div>;
}
