import Link from "next/link";
import { AlertTriangle, Building2, Plus, ShieldCheck, Store, Users } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { Badge, DateTimeCell, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requirePlatformAdmin } from "@/modules/auth/session";
import { createAccountAction } from "@/modules/platform/actions";
import { asPlatform, listAccounts } from "@/modules/platform/service";
import { isolationStatus, migrationStatus } from "@/modules/platform/status";

export const dynamic = "force-dynamic";

function NewAccountFields() {
  return <>
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="panel-title sm:col-span-2">Lojista</legend>
      <label className="label sm:col-span-2">Nome do lojista (cliente)<input className="field" name="name" required placeholder="Ex.: Arena Dragão Dourado Ltda."/></label>
      <label className="label">Limite de lojas<input className="field" name="maxStores" type="number" min="1" placeholder="Sem limite"/><span className="field-hint">Deixe vazio para não limitar.</span></label>
      <label className="label">Observações internas<input className="field" name="notes" placeholder="Plano, contato, combinados"/></label>
    </fieldset>
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="panel-title sm:col-span-2">Primeira loja</legend>
      <label className="label">Nome da loja<input className="field" name="storeName" required placeholder="Ex.: Loja Centro"/></label>
      <label className="label">CNPJ da loja (opcional)<input className="field" name="storeCnpj" inputMode="text" placeholder="Somente números ou letras"/></label>
    </fieldset>
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="panel-title sm:col-span-2">Titular (quem entra primeiro)</legend>
      <label className="label">Nome<input className="field" name="ownerName" required autoComplete="off"/></label>
      <label className="label">E-mail<input className="field" type="email" name="ownerEmail" required autoComplete="off"/></label>
      <label className="label sm:col-span-2">Senha provisória<input className="field" type="password" name="ownerPassword" minLength={10} required autoComplete="new-password"/><span className="field-hint">Mínimo de 10 caracteres. Passe ao titular por um canal seguro; ele pode trocá-la depois.</span></label>
    </fieldset>
  </>;
}

export default async function PlatformPage() {
  await requirePlatformAdmin();
  const [accounts, isolation, migrations] = await Promise.all([asPlatform(() => listAccounts()), isolationStatus(), migrationStatus()]);
  const stores = accounts.reduce((sum, account) => sum + account.stores, 0);
  const people = accounts.reduce((sum, account) => sum + account.users, 0);

  return <div className="section-gap">
    <PageHeader
      eyebrow="Plataforma"
      title="Lojistas"
      description="Os clientes do Coliseon. Cada lojista tem as suas lojas, a sua equipe e os seus dados, sem ver os de ninguém."
      actions={<Modal trigger={<><Plus size={16}/>Novo lojista</>} triggerClassName="btn btn-success" size="lg" title="Novo lojista" description="Cria o cliente, a primeira loja e o titular que vai administrar tudo.">
        <ActionForm action={createAccountAction} submitLabel="Criar lojista" className="grid gap-5"><NewAccountFields/></ActionForm>
      </Modal>}
    />

    <section className="stat-grid" aria-label="Resumo do sistema">
      <StatCard icon={Building2} label="Lojistas" value={accounts.length} hint={`${accounts.filter((account) => account.active).length} ativo(s)`}/>
      <StatCard tone="info" icon={Store} label="Lojas" value={stores}/>
      <StatCard icon={Users} label="Pessoas" value={people} hint="Titulares e equipes"/>
    </section>

    <section className="card" aria-label="Saúde do isolamento">
      <div className="panel-head"><div><h2 className="panel-title">Saúde do sistema</h2><p className="panel-desc">O que garante que um lojista nunca vê os dados de outro.</p></div></div>
      <div className="health-list">
        <div className="health-row">
          {isolation.enforced ? <ShieldCheck size={18} className="pos"/> : <AlertTriangle size={18} className="neg"/>}
          <div>
            <b>Isolamento entre lojistas no banco: {isolation.enforced ? "ativo" : "NÃO está valendo"}</b>
            <p className="muted">{isolation.enforced
              ? `O app conecta como "${isolation.role}", sem privilégio de administrador do banco. As travas por lojista e por loja valem para qualquer consulta.`
              : isolation.privilegedRole
                ? `O app conecta como "${isolation.role}", que tem privilégio total no banco e ignora as travas. Enquanto for assim, não crie outro lojista nem outra loja. Passo a passo: seção 9 do roteiro (docs/RUNBOOK_MIGRACAO.md).`
                : `Faltam travas nas tabelas: ${isolation.unprotected.join(", ")}. Aplique as migrations pendentes.`}</p>
          </div>
        </div>
        <div className="health-row">
          {migrations.pending ? <AlertTriangle size={18} className="neg"/> : <ShieldCheck size={18} className="pos"/>}
          <div>
            <b>Migrations do banco: {migrations.applied ?? "?"} de {migrations.expected ?? "?"} aplicadas</b>
            <p className="muted">{migrations.pending ? "Há migrations pendentes. No terminal do app, rode: node scripts/migrate.mjs --apply (com backup feito)." : "O banco está na versão que o código espera."}</p>
          </div>
        </div>
      </div>
    </section>

    <section className="card">
      {accounts.length ? <div className="table-wrap"><table>
        <thead><tr><th>Lojista</th><th>Titular</th><th className="num">Lojas</th><th className="num">Pessoas</th><th>Status</th><th>Desde</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{accounts.map((account) => <tr key={account.id}>
          <td className="cell-wrap"><span className="cell-main"><b>{account.name}</b>{account.notes && <small>{account.notes}</small>}</span></td>
          <td className="cell-wrap"><span className="cell-main"><span>{account.owner_name ?? <span className="muted">Sem titular</span>}</span><small>{account.owner_email}</small></span></td>
          <td className="num">{account.stores}{account.max_stores !== null && <small className="muted"> / {account.max_stores}</small>}</td>
          <td className="num">{account.users}</td>
          <td><Badge tone={account.active ? "ok" : "warn"} dot>{account.active ? "Ativo" : "Suspenso"}</Badge></td>
          <td><DateTimeCell value={account.created_at}/></td>
          <td className="col-actions"><Link className="btn btn-ghost btn-sm" href={`/plataforma/lojistas/${account.id}`}>Abrir</Link></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon={Building2} title="Nenhum lojista ainda" description="Crie o primeiro cliente com o botão Novo lojista."/>}
    </section>
  </div>;
}
