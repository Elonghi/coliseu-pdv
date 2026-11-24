import { Download, KeyRound, Pencil, Plus, Power, Printer, RotateCcw, TestTube2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { PrinterTokenForm } from "@/components/printer-token-form";
import { Badge, DateTimeCell, EmptyState, PageHeader, type Tone } from "@/components/ui";
import { pool } from "@/db";
import { formatDateTime } from "@/lib/format";
import { saleNumber } from "@/lib/money";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { codePages, codePageNames } from "@/modules/printing/code-pages";
import { createTerminalAction, reprintSaleAction, rotateTokenAction, testPrintAction, toggleTerminalAction, updateTerminalAction } from "@/modules/printing/actions";
import { AGENT_ONLINE_MS } from "@/modules/printing/service";

export const dynamic = "force-dynamic";

type TerminalRow = { id: string; name: string; columns: number; code_page: string; cut: boolean; active: boolean; last_seen_at: Date | null; agent_info: string | null; online: boolean; pending: number };
type JobRow = { id: string; terminal_id: string; terminal_name: string; kind: string; sale_id: number | null; status: string; error: string | null; created_at: Date; finished_at: Date | null; requester: string | null };

const statusBadge: Record<string, { tone: Tone; label: string }> = {
  QUEUED: { tone: "warn", label: "Na fila" },
  SENT: { tone: "info", label: "Enviado ao agente" },
  PRINTED: { tone: "ok", label: "Impresso" },
  FAILED: { tone: "danger", label: "Falhou" },
};

function ProfileFields({ terminal }: { terminal?: TerminalRow }) {
  return <>
    <label className="label">Nome<input className="field" name="name" defaultValue={terminal?.name} placeholder="Ex.: Caixa balcão" maxLength={80} required/></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="label">Colunas<input className="field" name="columns" type="number" min={24} max={80} defaultValue={terminal?.columns ?? 48} required/><small className="text-gray-500">48 em 80 mm, 32 em 58 mm</small></label>
      <label className="label">Acentos<select className="field" name="codePage" defaultValue={terminal?.code_page ?? "CP860"}>{codePageNames.map((name) => <option key={name} value={name}>{codePages[name].label}</option>)}</select></label>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="cut" defaultChecked={terminal?.cut ?? true}/>A impressora tem guilhotina (corta o papel no fim)</label>
  </>;
}

export default async function PrintersPage() {
  const user = await requirePermission(permissions.CASH_MANAGE);
  const isAdmin = user.role === "ADMIN";
  const [terminals, jobs] = await Promise.all([
    pool.query<TerminalRow>(`SELECT t.id,t.name,t.columns,t.code_page,t.cut,t.active,t.last_seen_at,t.agent_info,
      COALESCE(t.last_seen_at > now() - make_interval(secs => $1),false) online,
      (SELECT count(*) FROM print_jobs j WHERE j.terminal_id=t.id AND j.status='QUEUED')::int pending
      FROM print_terminals t ORDER BY t.active DESC,t.name`, [AGENT_ONLINE_MS / 1000]),
    pool.query<JobRow>(`SELECT j.id,j.terminal_id,t.name terminal_name,j.kind,j.sale_id,j.status,j.error,j.created_at,j.finished_at,u.name requester
      FROM print_jobs j JOIN print_terminals t ON t.id=j.terminal_id LEFT JOIN users u ON u.id=j.requested_by_id
      ORDER BY j.created_at DESC LIMIT 30`),
  ]);

  return <div className="section-gap">
    <PageHeader
      eyebrow="Operação"
      title="Impressoras"
      description="Impressoras térmicas dos caixas. Cada uma é atendida por um agente instalado no computador onde ela está ligada."
      actions={<>
        <a className="btn btn-ghost" href="/api/print/agent/script"><Download size={16}/>Baixar agente</a>
        {isAdmin && <Modal trigger={<><Plus size={16}/>Nova impressora</>} triggerClassName="btn btn-primary" size="sm" title="Nova impressora" description="Depois de salvar, copie o endereço e o token para o instalador do agente no computador do caixa.">
          <PrinterTokenForm action={createTerminalAction} submitLabel="Cadastrar impressora"><ProfileFields/></PrinterTokenForm>
        </Modal>}
      </>}
    />

    <section className="grid grid-cols-1 gap-4">
      {terminals.rows.map((terminal) => <article className="card" key={terminal.id}>
        <div className="panel-head">
          <div>
            <h3 className="panel-title flex items-center gap-2"><Printer size={17}/>{terminal.name}</h3>
            <p className="panel-desc">{terminal.columns} colunas · {codePages[terminal.code_page as keyof typeof codePages]?.label ?? terminal.code_page} · {terminal.cut ? "com guilhotina" : "sem guilhotina"}{terminal.agent_info ? ` · ${terminal.agent_info}` : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!terminal.active ? <Badge tone="neutral">Desativada</Badge> : terminal.online ? <Badge tone="ok" dot>Agente conectado</Badge> : <Badge tone="danger" dot>{terminal.last_seen_at ? `Sem contato desde ${formatDateTime(terminal.last_seen_at)}` : "Agente nunca conectou"}</Badge>}
            {terminal.pending > 0 && <Badge tone="warn">{terminal.pending} na fila</Badge>}
          </div>
        </div>
        <div className="panel-body flex flex-wrap gap-2">
          {terminal.active && <ActionForm action={testPrintAction} submitLabel="Imprimir teste" submitVariant="ghost" inline><input type="hidden" name="id" value={terminal.id}/></ActionForm>}
          {isAdmin && <>
            <Modal trigger={<><Pencil size={15}/>Editar</>} size="sm" title={`Editar ${terminal.name}`} description="As mudanças valem para os próximos comprovantes.">
              <ActionForm action={updateTerminalAction} submitLabel="Salvar" className="grid gap-4"><input type="hidden" name="id" value={terminal.id}/><ProfileFields terminal={terminal}/></ActionForm>
            </Modal>
            <Modal trigger={<><KeyRound size={15}/>Novo token</>} size="sm" title="Gerar token novo" description="Use se o token vazou ou se o computador do caixa foi trocado. O agente atual para de funcionar até receber o token novo (rode o instalador de novo ou troque no config.json).">
              <PrinterTokenForm action={rotateTokenAction} submitLabel="Gerar token novo" submitVariant="danger"><input type="hidden" name="id" value={terminal.id}/></PrinterTokenForm>
            </Modal>
            <ActionForm action={toggleTerminalAction} submitLabel={terminal.active ? "Desativar" : "Reativar"} submitVariant={terminal.active ? "danger" : "ghost"} inline>
              <input type="hidden" name="id" value={terminal.id}/><input type="hidden" name="active" value={terminal.active ? "false" : "true"}/>
            </ActionForm>
          </>}
        </div>
      </article>)}
      {!terminals.rowCount && <div className="card"><EmptyState icon={Printer} title="Nenhuma impressora cadastrada" description={isAdmin ? "Cadastre a impressora do caixa e rode o instalador do agente no computador onde ela está ligada." : "Peça a um administrador para cadastrar a impressora do caixa."}/></div>}
    </section>

    <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">Últimas impressões</h2><p className="panel-desc">Os 30 pedidos mais recentes. Pedidos que o agente não busca em 10 minutos expiram, para não sair uma pilha de cupons quando ele religar.</p></div></div>
      {jobs.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Quando</th><th>Impressora</th><th>Documento</th><th>Pedido por</th><th>Situação</th><th></th></tr></thead>
        <tbody>{jobs.rows.map((job) => {
          const badge = statusBadge[job.status] ?? { tone: "neutral" as Tone, label: job.status };
          return <tr key={job.id}>
            <td><DateTimeCell value={job.created_at}/></td>
            <td>{job.terminal_name}</td>
            <td>{job.kind === "SALE_RECEIPT" && job.sale_id ? <>Comprovante <b>{saleNumber(job.sale_id)}</b></> : "Página de teste"}</td>
            <td>{job.requester ?? "—"}</td>
            <td><Badge tone={badge.tone} dot>{badge.label}</Badge>{job.error && <small className="block text-red-700">{job.error}</small>}</td>
            <td>{job.kind === "SALE_RECEIPT" && job.sale_id && <ActionForm action={reprintSaleAction} submitLabel="Reimprimir" submitVariant="ghost" inline>
              <input type="hidden" name="saleId" value={job.sale_id}/><input type="hidden" name="terminalId" value={job.terminal_id}/>
            </ActionForm>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <EmptyState icon={TestTube2} title="Nada impresso ainda" description="Use “Imprimir teste” numa impressora para conferir acentos, largura e corte."/>}
    </section>

    <section className="card">
      <div className="panel-head"><div><h2 className="panel-title flex items-center gap-2"><RotateCcw size={17}/>Como instalar o agente</h2></div></div>
      <div className="panel-body grid gap-2 text-sm text-gray-700">
        <p><b>Windows:</b> instale o driver da impressora e rode o instalador do agente (<code>coliseu-print-agent-setup</code>, já traz tudo o que precisa). Ele pede o endereço do sistema e o token mostrados ao cadastrar a impressora (ou em Novo token), confere os dois, lista as impressoras do Windows, liga o agente junto com o computador e imprime uma página de teste. Para atualizar o agente, rode o instalador novo por cima, com o token em branco.</p>
        <p><b>Linux:</b> crie uma fila &quot;raw&quot; do CUPS para a impressora, instale o Node.js 20 ou mais novo, baixe o agente (botão acima) e salve numa pasta com o <code>config.json</code>. Rode <code>node coliseu-print-agent.mjs --test</code> e depois <code>node coliseu-print-agent.mjs</code>.</p>
        <p className="flex items-center gap-1 text-gray-500"><Power size={14}/>O selo acima fica verde quando o agente conecta. No Linux, para ligar junto com o computador, use o serviço do systemd descrito no começo do arquivo do agente.</p>
      </div>
    </section>
  </div>;
}
