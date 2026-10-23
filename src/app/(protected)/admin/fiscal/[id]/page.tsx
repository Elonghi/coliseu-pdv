import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { pool } from "@/db";
import { formatMoney } from "@/lib/money";
import { fiscalStockEntryAction } from "@/modules/admin/actions";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { sefazPublicConfig } from "@/modules/fiscal/config";
import { fiscalDirection, fiscalDirectionLabel } from "@/modules/fiscal/direction";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = { AUTHORIZED: "Autorizada", CANCELED: "Cancelada", DENIED: "Denegada", UNKNOWN: "Pendente" };
const duplicateStatus: Record<string, string> = { OPEN: "Aberta", PARTIAL: "Parcial", SETTLED: "Liquidada", CANCELED: "Cancelada" };
const formatDocument = (value: string | null) => value?.length === 14 ? value.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5") : value ?? "—";

type FiscalItem = {
  id: string; item_number: number; product_code: string | null; ean: string | null; description: string;
  ncm: string | null; cfop: string | null; unit: string | null; quantity: string | null;
  unit_value_cents: number | null; total_cents: number | null; discount_cents: number | null;
  freight_cents: number | null; insurance_cents: number | null; other_cents: number | null;
  product_id: string | null; product_name: string | null; product_sku: string | null; product_active: boolean | null;
  stock_unit_cost_cents: number | null; stock_imported_at: Date | null; stock_reversed_at: Date | null; stock_import_error: string | null;
};

export default async function FiscalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(permissions.FISCAL_MANAGE);
  const { id } = await params;
  const [invoice, items, events, duplicates] = await Promise.all([
    pool.query<{ id: string; access_key: string; has_full_xml: boolean; status: string; issuer_cnpj_cpf: string | null; issuer_name: string | null; issuer_state_registration: string | null; recipient_cnpj_cpf: string | null; recipient_name: string | null; recipient_state_registration: string | null; issue_at: Date | null; authorization_at: Date | null; operation_type: number | null; model: string | null; series: string | null; number: string | null; operation_nature: string | null; total_cents: number | null; protocol: string | null; manifestation_status: string | null; xml_version: string | null; original_file_name: string | null; origin: string }>("SELECT f.id,f.access_key,f.has_full_xml,f.status,f.issuer_cnpj_cpf,f.issuer_name,f.issuer_state_registration,f.recipient_cnpj_cpf,f.recipient_name,f.recipient_state_registration,f.issue_at,f.authorization_at,f.operation_type,f.model,f.series,f.number,f.operation_nature,f.total_cents::float8 AS total_cents,f.protocol,f.manifestation_status,f.xml_version,d.original_file_name,CASE WHEN d.import_batch_id IS NULL THEN 'SEFAZ' ELSE 'XML importado' END origin FROM fiscal_invoices f LEFT JOIN fiscal_dfe_documents d ON d.id=f.source_document_id WHERE f.id=$1", [id]),
    pool.query<FiscalItem>(`SELECT i.id,i.item_number,i.product_code,i.ean,i.description,i.ncm,i.cfop,i.unit,i.quantity,i.unit_value_cents::float8 AS unit_value_cents,i.total_cents::float8 AS total_cents,i.discount_cents::float8 AS discount_cents,i.freight_cents::float8 AS freight_cents,i.insurance_cents::float8 AS insurance_cents,i.other_cents::float8 AS other_cents,i.product_id,p.name product_name,p.sku product_sku,p.active product_active,i.stock_unit_cost_cents,i.stock_imported_at,i.stock_reversed_at,i.stock_import_error
      FROM fiscal_invoice_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.invoice_id=$1 ORDER BY i.item_number`, [id]),
    pool.query<{ id: string; event_type: string | null; event_at: Date | null; protocol: string | null; status_code: string | null; status_message: string | null }>("SELECT id,event_type,event_at,protocol,status_code,status_message FROM fiscal_invoice_events WHERE invoice_id=$1 ORDER BY event_at DESC NULLS LAST", [id]),
    pool.query<{ id: string; source_reference: string | null; installment_number: number; due_date: string; amount_cents: number; settled_cents: number; status: string }>(`SELECT i.id,i.source_reference,i.installment_number,i.due_date::text,i.amount_cents,i.settled_cents,i.status
      FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id WHERE a.fiscal_invoice_id=$1 ORDER BY i.installment_number`, [id]),
  ]);
  const note = invoice.rows[0];
  if (!note) notFound();
  const cnpj = sefazPublicConfig().cnpj;
  const direction = cnpj ? fiscalDirection(cnpj, note.issuer_cnpj_cpf, note.recipient_cnpj_cpf) : null;
  const pendingItems = items.rows.filter((item) => !item.stock_imported_at);
  const enteredItems = items.rows.filter((item) => item.stock_imported_at && !item.stock_reversed_at);
  const canManageStock = user.role === "ADMIN" || user.permissions.includes(permissions.STOCK_MANAGE);
  const canReceive = direction === "ENTRY" && note.status === "AUTHORIZED" && note.has_full_xml && pendingItems.length > 0 && canManageStock;

  return <div className="grid gap-6">
    <header className="flex flex-wrap justify-between gap-3">
      <div><Link className="text-blue-700 font-bold" href="/admin/fiscal">← Notas fiscais</Link><p className="text-sm text-gray-500 font-bold mt-3">NF-e MODELO {note.model ?? "55"}</p><h1 className="text-3xl font-black">Nota {note.number ?? "sem número"} · Série {note.series ?? "—"}</h1><p className="font-mono text-sm break-all text-gray-500">{note.access_key}</p>{note.original_file_name && <p className="text-sm text-gray-500">Arquivo original: {note.original_file_name}</p>}</div>
      <div className="flex flex-wrap items-start gap-2"><span className="badge badge-warn">{note.origin}</span><span className={`badge ${note.status === "AUTHORIZED" ? "badge-ok" : note.status === "CANCELED" ? "badge-danger" : "badge-warn"}`}>{statusLabel[note.status] ?? note.status}</span>{note.has_full_xml && <><a className="btn btn-ghost" href={`/api/fiscal/invoices/${note.id}/xml`}>Baixar XML</a><a className="btn btn-primary" href={`/api/fiscal/invoices/${note.id}/pdf`}>Baixar DANFE PDF</a></>}</div>
    </header>

    <section className="grid md:grid-cols-2 gap-4"><article className="card p-5"><small className="text-gray-500">EMITENTE</small><h2 className="font-black text-xl">{note.issuer_name ?? "Não identificado"}</h2><p>{formatDocument(note.issuer_cnpj_cpf)} · IE {note.issuer_state_registration ?? "—"}</p></article><article className="card p-5"><small className="text-gray-500">DESTINATÁRIO</small><h2 className="font-black text-xl">{note.recipient_name ?? "Disponível após obter o XML completo"}</h2><p>{formatDocument(note.recipient_cnpj_cpf)} · IE {note.recipient_state_registration ?? "—"}</p></article></section>
    <section className="card p-5 grid sm:grid-cols-2 xl:grid-cols-5 gap-4"><div><small className="text-gray-500">Emissão</small><b className="block">{note.issue_at?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "—"}</b></div><div><small className="text-gray-500">Autorização</small><b className="block">{note.authorization_at?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "—"}</b></div><div><small className="text-gray-500">Movimento da loja</small><b className="block">{direction ? fiscalDirectionLabel(direction) : "CNPJ não configurado"}</b><small className="text-gray-500">Tipo informado pelo emitente: {note.operation_type === 0 ? "Entrada" : note.operation_type === 1 ? "Saída" : "—"}</small></div><div><small className="text-gray-500">Protocolo</small><b className="block">{note.protocol ?? "—"}</b></div><div><small className="text-gray-500">Valor total</small><b className="block text-2xl">{note.total_cents === null ? "—" : formatMoney(note.total_cents)}</b></div><div className="sm:col-span-2 xl:col-span-5"><small className="text-gray-500">Natureza da operação</small><b className="block">{note.operation_nature ?? "Disponível no XML completo"}</b></div></section>

    <section className="card">
      <div className="p-5 flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-black">Itens da nota e entrada no estoque</h2><p className="text-sm text-gray-500">Importar a NF-e não altera o estoque. Confirme o recebimento físico para lançar quantidades e custos; produtos novos serão criados inativos para revisão.</p></div>
        {canReceive && <ActionForm action={fiscalStockEntryAction} submitLabel={`Dar entrada em ${pendingItems.length} item(ns)`} className="grid gap-2 min-w-64"><input type="hidden" name="invoiceId" value={note.id}/><small className="text-gray-500">Esta operação será registrada na auditoria.</small></ActionForm>}
        {!canReceive && enteredItems.length === items.rows.length && !!items.rowCount && <span className="badge badge-ok">Entrada concluída</span>}
        {!canReceive && direction === "ENTRY" && pendingItems.length > 0 && !canManageStock && <span className="badge badge-warn">Exige permissão de estoque</span>}
        {!canReceive && direction !== "ENTRY" && !!items.rowCount && <span className="badge">Nota sem entrada de estoque</span>}
      </div>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>NCM / CFOP</th><th>Quantidade</th><th>Custo unitário</th><th>Composição</th><th>Estoque</th></tr></thead><tbody>{items.rows.map((item) => <tr key={item.id}><td>{item.item_number}</td><td>{item.product_code ?? "—"}</td><td className="font-bold">{item.description}<small className="block text-gray-500">EAN {item.ean ?? "—"}</small></td><td>{item.ncm ?? "—"}<small className="block text-gray-500">CFOP {item.cfop ?? "—"}</small></td><td>{item.quantity ?? "—"} {item.unit ?? ""}</td><td>{item.stock_unit_cost_cents === null ? (item.unit_value_cents === null ? "—" : formatMoney(item.unit_value_cents)) : formatMoney(item.stock_unit_cost_cents)}</td><td>{item.total_cents === null ? "—" : formatMoney(item.total_cents)}<small className="block text-gray-500">Desconto {formatMoney(item.discount_cents ?? 0)} · Frete {formatMoney(item.freight_cents ?? 0)} · Seguro {formatMoney(item.insurance_cents ?? 0)} · Outros {formatMoney(item.other_cents ?? 0)}</small></td><td>{item.product_id && <Link className="font-bold text-blue-700" href={`/admin/products/${item.product_id}`}>{item.product_name ?? item.product_sku}</Link>}{item.stock_reversed_at ? <small className="block text-red-600 font-bold">Entrada estornada</small> : item.stock_imported_at ? <small className="block text-green-700 font-bold">Entrada realizada{item.product_active === false ? " · produto inativo" : ""}</small> : item.stock_import_error ? <small className="block text-red-600 font-bold">{item.stock_import_error}</small> : <small className="block text-amber-700 font-bold">Aguardando entrada</small>}</td></tr>)}{!items.rowCount && <tr><td colSpan={8}>O resumo da SEFAZ não contém os itens. O XML integral pode exigir manifestação do destinatário.</td></tr>}</tbody></table></div>
    </section>

    <section className="card"><div className="p-5 flex flex-wrap justify-between gap-3"><div><h2 className="font-black">Duplicatas / contas a pagar</h2><p className="text-sm text-gray-500">Parcelas extraídas do grupo de cobrança do XML.</p></div>{duplicates.rowCount ? <Link className="btn btn-ghost" href="/admin/finance">Abrir financeiro</Link> : null}</div><div className="table-wrap"><table><thead><tr><th>Duplicata</th><th>Vencimento</th><th>Valor</th><th>Liquidado</th><th>Status</th></tr></thead><tbody>{duplicates.rows.map((duplicate) => <tr key={duplicate.id}><td className="font-bold">{duplicate.source_reference ?? duplicate.installment_number}</td><td>{new Date(`${duplicate.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</td><td>{formatMoney(duplicate.amount_cents)}</td><td>{formatMoney(duplicate.settled_cents)}</td><td>{duplicateStatus[duplicate.status] ?? duplicate.status}</td></tr>)}{!duplicates.rowCount && <tr><td colSpan={5}>Esta NF-e não gerou duplicatas no contas a pagar.</td></tr>}</tbody></table></div></section>
    <section className="card"><div className="p-5"><h2 className="font-black">Eventos fiscais</h2></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Protocolo</th><th>Resultado</th></tr></thead><tbody>{events.rows.map((event) => <tr key={event.id}><td>{event.event_at?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "—"}</td><td>{event.event_type ?? "—"}</td><td>{event.protocol ?? "—"}</td><td>{event.status_code ?? "—"} · {event.status_message ?? "—"}</td></tr>)}{!events.rowCount && <tr><td colSpan={4}>Nenhum evento recebido.</td></tr>}</tbody></table></div></section>
  </div>;
}
