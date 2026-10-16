import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { FiscalImportForm } from "@/components/fiscal-import-form";
import { pool } from "@/db";
import { sefazSyncAction } from "@/modules/admin/actions";
import { sefazPublicConfig } from "@/modules/fiscal/config";

export const dynamic = "force-dynamic";

const environmentLabel: Record<string,string> = { PRODUCTION: "Produção", HOMOLOGATION: "Homologação" };
const formatDocument = (value:string|null) => value?.length===14?value.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/,"$1.$2.$3/$4-$5"):value??"—";

export default async function FiscalIntegrationPage() {
  const [states,imports,pendingSummaries]=await Promise.all([
    pool.query<{id:string;company_cnpj:string;environment:string;last_nsu:string;max_nsu:string;last_status_code:string|null;last_status_message:string|null;last_error:string|null;last_synced_at:Date|null;next_sync_at:Date}>("SELECT * FROM sefaz_sync_states ORDER BY created_at DESC"),
    pool.query<{id:string;file_count:number;imported_count:number;duplicate_count:number;failed_count:number;created_at:Date;completed_at:Date|null;user_name:string|null}>("SELECT b.id,b.file_count,b.imported_count,b.duplicate_count,b.failed_count,b.created_at,b.completed_at,u.name user_name FROM fiscal_import_batches b LEFT JOIN users u ON u.id=b.imported_by_id ORDER BY b.created_at DESC LIMIT 10"),
    pool.query<{total:number}>("SELECT count(*)::int total FROM fiscal_invoices WHERE has_full_xml=false AND (issue_at IS NULL OR issue_at>=now()-interval '90 days')"),
  ]);
  const config=sefazPublicConfig();
  return <div className="grid gap-6"><header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-gray-500 font-bold">INTEGRAÇÃO FISCAL</p><h1 className="text-3xl font-black">Importação e SEFAZ</h1><p className="text-gray-500">Sincronize a distribuição de DF-e ou importe XMLs antigos em lote.</p></div><Link className="btn btn-ghost" href="/admin/fiscal">Ver notas fiscais</Link></header>
    <section className="grid lg:grid-cols-[1fr_auto] gap-4"><div className="card p-5 grid sm:grid-cols-2 xl:grid-cols-5 gap-4"><div><small className="text-gray-500">Integração</small><b className={`block ${config.enabled?"text-emerald-700":"text-red-600"}`}>{config.enabled?"Ativa":"Desativada"}</b></div><div><small className="text-gray-500">Ambiente</small><b className="block">{environmentLabel[config.environment]}</b></div><div><small className="text-gray-500">CNPJ</small><b className="block">{formatDocument(config.cnpj)}</b></div><div><small className="text-gray-500">Certificado A1</small><b className="block">{config.certificateConfigured?"Configurado":"Não configurado"}</b></div><div><small className="text-gray-500">Resumos pendentes</small><b className={`block ${pendingSummaries.rows[0]?.total?"text-amber-700":"text-emerald-700"}`}>{pendingSummaries.rows[0]?.total??0}</b></div></div><ActionForm action={sefazSyncAction} submitLabel="Sincronizar agora" className="card p-5 flex flex-col justify-center gap-2"><p className="text-sm text-gray-500">Além dos novos NSUs, consulta por chave até 20 resumos dos últimos 90 dias para recuperar XMLs já manifestados.</p></ActionForm></section>
    {states.rows.map(state=><section className="card p-5 grid sm:grid-cols-2 xl:grid-cols-5 gap-4" key={state.id}><div><small className="text-gray-500">Último NSU</small><b className="block font-mono">{state.last_nsu}</b></div><div><small className="text-gray-500">Maior NSU</small><b className="block font-mono">{state.max_nsu}</b></div><div><small className="text-gray-500">Última consulta</small><b className="block">{state.last_synced_at?.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})??"Nunca"}</b></div><div><small className="text-gray-500">Próxima consulta</small><b className="block">{state.next_sync_at.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</b></div><div><small className="text-gray-500">Resposta</small><b className="block">{state.last_status_code??"—"}</b><span className="text-xs text-gray-500">{state.last_status_message}</span></div>{state.last_error&&<p className="notice-error sm:col-span-2 xl:col-span-5">{state.last_error}</p>}</section>)}
    {!config.enabled&&<p className="notice-error">Defina as variáveis <code>SEFAZ_*</code> no Coolify e habilite <code>SEFAZ_ENABLED=true</code>.</p>}
    <FiscalImportForm/>
    {!!imports.rowCount&&<section className="card"><div className="p-5"><h2 className="font-black">Importações recentes</h2></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Responsável</th><th>Arquivos</th><th>Importadas</th><th>Duplicadas</th><th>Erros</th></tr></thead><tbody>{imports.rows.map(batch=><tr key={batch.id}><td>{batch.created_at.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</td><td>{batch.user_name??"Usuário removido"}</td><td>{batch.file_count}</td><td className="font-bold text-emerald-700">{batch.imported_count}</td><td>{batch.duplicate_count}</td><td className={batch.failed_count?"font-bold text-red-600":""}>{batch.failed_count}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
