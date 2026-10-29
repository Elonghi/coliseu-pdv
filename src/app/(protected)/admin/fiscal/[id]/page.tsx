import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, PackageCheck } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { FiscalReceiptChecklist } from "@/components/fiscal-receipt-checklist";
import { Modal } from "@/components/modal";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { formatDateTime, formatDueDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { sefazPublicConfig } from "@/modules/fiscal/config";
import { fiscalDirection, fiscalDirectionLabel } from "@/modules/fiscal/direction";
import { fiscalItemMark } from "@/modules/fiscal/stock";
import { fiscalReceiptAction } from "@/modules/fiscal/stock-actions";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = { AUTHORIZED: "Autorizada", CANCELED: "Cancelada", DENIED: "Denegada", UNKNOWN: "Pendente" };
const duplicateStatus: Record<string, string> = { OPEN: "Aberta", PARTIAL: "Parcial", SETTLED: "Liquidada", CANCELED: "Cancelada" };
const formatDocument = (value: string | null) => value?.length === 14 ? value.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5") : value ?? "—";
const formatQuantity = (value: string | number | null) => value === null ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

type FiscalItem = {
  id: string; item_number: number; product_code: string | null; ean: string | null; description: string;
  ncm: string | null; cfop: string | null; unit: string | null; quantity: string | null;
  unit_value_cents: number | null; total_cents: number | null; discount_cents: number | null;
  freight_cents: number | null; insurance_cents: number | null; other_cents: number | null;
  product_id: string | null; product_name: string | null; product_sku: string | null; product_active: boolean | null;
  stock_unit_cost_cents: number | null; stock_imported_at: Date | null; stock_reversed_at: Date | null; stock_import_error: string | null;
  received_quantity: number | null;
};

export default async function FiscalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(permissions.FISCAL_MANAGE);
  const { id } = await params;
  const [invoice, items, events, duplicates] = await Promise.all([
    pool.query<{ id: string; access_key: string; has_full_xml: boolean; status: string; issuer_cnpj_cpf: string | null; issuer_name: string | null; issuer_state_registration: string | null; recipient_cnpj_cpf: string | null; recipient_name: string | null; recipient_state_registration: string | null; issue_at: Date | null; authorization_at: Date | null; operation_type: number | null; model: string | null; series: string | null; number: string | null; operation_nature: string | null; total_cents: number | null; protocol: string | null; manifestation_status: string | null; xml_version: string | null; original_file_name: string | null; origin: string }>("SELECT f.id,f.access_key,f.has_full_xml,f.status,f.issuer_cnpj_cpf,f.issuer_name,f.issuer_state_registration,f.recipient_cnpj_cpf,f.recipient_name,f.recipient_state_registration,f.issue_at,f.authorization_at,f.operation_type,f.model,f.series,f.number,f.operation_nature,f.total_cents::float8 AS total_cents,f.protocol,f.manifestation_status,f.xml_version,d.original_file_name,CASE WHEN d.import_batch_id IS NULL THEN 'SEFAZ' ELSE 'XML importado' END origin FROM fiscal_invoices f LEFT JOIN fiscal_dfe_documents d ON d.id=f.source_document_id WHERE f.id=$1", [id]),
    pool.query<FiscalItem>(`SELECT i.id,i.item_number,i.product_code,i.ean,i.description,i.ncm,i.cfop,i.unit,i.quantity,i.unit_value_cents::float8 AS unit_value_cents,i.total_cents::float8 AS total_cents,i.discount_cents::float8 AS discount_cents,i.freight_cents::float8 AS freight_cents,i.insurance_cents::float8 AS insurance_cents,i.other_cents::float8 AS other_cents,i.product_id,p.name product_name,p.sku product_sku,p.active product_active,i.stock_unit_cost_cents,i.stock_imported_at,i.stock_reversed_at,i.stock_import_error,
      (SELECT m.quantity_delta FROM stock_movements m WHERE m.fiscal_invoice_item_id=i.id AND m.type='FISCAL_ENTRY' LIMIT 1) received_quantity
      FROM fiscal_invoice_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.invoice_id=$1 ORDER BY i.item_number`, [id]),
    pool.query<{ id: string; event_type: string | null; event_at: Date | null; protocol: string | null; status_code: string | null; status_message: string | null }>("SELECT id,event_type,event_at,protocol,status_code,status_message FROM fiscal_invoice_events WHERE invoice_id=$1 ORDER BY event_at DESC NULLS LAST", [id]),
    pool.query<{ id: string; source_reference: string | null; installment_number: number; due_date: string; amount_cents: number; settled_cents: number; status: string }>(`SELECT i.id,i.source_reference,i.installment_number,i.due_date::text,i.amount_cents,i.settled_cents,i.status
      FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id WHERE a.fiscal_invoice_id=$1 ORDER BY i.installment_number`, [id]),
  ]);
  const note = invoice.rows[0];
  if (!note) notFound();
  const cnpj = sefazPublicConfig().cnpj;
  const direction = cnpj ? fiscalDirection(cnpj, note.issuer_cnpj_cpf, note.recipient_cnpj_cpf) : null;

  const stateOf = (item: FiscalItem) => {
    if (item.stock_reversed_at) return "reversed" as const;
    if (item.stock_imported_at) return "entered" as const;
    const mark = fiscalItemMark(item.stock_import_error);
    if (mark) return mark;
    return item.stock_import_error ? "error" as const : "pending" as const;
  };
  const awaiting = items.rows.filter((item) => ["pending", "missing", "error"].includes(stateOf(item)));
  const enteredItems = items.rows.filter((item) => stateOf(item) === "entered");
  const skippedItems = items.rows.filter((item) => stateOf(item) === "skipped");
  const missingItems = items.rows.filter((item) => stateOf(item) === "missing");
  const receiptItems = items.rows.filter((item) => !item.stock_imported_at);
  const resolved = enteredItems.length + skippedItems.length === items.rows.length && !!items.rowCount;
  const canManageStock = user.role === "ADMIN" || user.permissions.includes(permissions.STOCK_MANAGE);
  const canReceive = direction === "ENTRY" && note.status === "AUTHORIZED" && note.has_full_xml && receiptItems.length > 0 && canManageStock;
  const unitCost = (item: FiscalItem) => item.stock_unit_cost_cents ?? item.unit_value_cents;

  return <div className="section-gap">
    <PageHeader
      back={{ href: "/admin/fiscal", label: "Notas fiscais" }}
      eyebrow={`NF-e MODELO ${note.model ?? "55"}`}
      title={`Nota ${note.number ?? "sem número"} · Série ${note.series ?? "—"}`}
      description={<><span className="mono break-all">{note.access_key}</span>{note.original_file_name && <><br/>Arquivo original: {note.original_file_name}</>}</>}
      actions={<>
        <Badge tone="warn">{note.origin}</Badge>
        <Badge tone={note.status === "AUTHORIZED" ? "ok" : note.status === "CANCELED" ? "danger" : "warn"} dot>{statusLabel[note.status] ?? note.status}</Badge>
        {note.has_full_xml && <>
          <a className="btn btn-ghost" href={`/api/fiscal/invoices/${note.id}/xml`}><Download size={15}/>Baixar XML</a>
          <a className="btn btn-primary" href={`/api/fiscal/invoices/${note.id}/pdf`}><FileText size={15}/>Baixar DANFE PDF</a>
        </>}
      </>}
    />

    <section className="grid gap-4 md:grid-cols-2">
      <article className="card panel-body"><p className="chip-label">Emitente</p><h2 className="text-lg font-bold mt-1">{note.issuer_name ?? "Não identificado"}</h2><p className="muted text-sm">{formatDocument(note.issuer_cnpj_cpf)} · IE {note.issuer_state_registration ?? "—"}</p></article>
      <article className="card panel-body"><p className="chip-label">Destinatário</p><h2 className="text-lg font-bold mt-1">{note.recipient_name ?? "Disponível após obter o XML completo"}</h2><p className="muted text-sm">{formatDocument(note.recipient_cnpj_cpf)} · IE {note.recipient_state_registration ?? "—"}</p></article>
    </section>

    <section className="card panel-body"><dl className="kv">
      <div><dt>Emissão</dt><dd>{formatDateTime(note.issue_at)}</dd></div>
      <div><dt>Autorização</dt><dd>{formatDateTime(note.authorization_at)}</dd></div>
      <div><dt>Movimento da loja</dt><dd>{direction ? fiscalDirectionLabel(direction) : "CNPJ não configurado"}<small className="block muted font-normal">Tipo informado pelo emitente: {note.operation_type === 0 ? "Entrada" : note.operation_type === 1 ? "Saída" : "—"}</small></dd></div>
      <div><dt>Protocolo</dt><dd>{note.protocol ?? "—"}</dd></div>
      <div><dt>Valor total</dt><dd className="text-xl">{note.total_cents === null ? "—" : formatMoney(note.total_cents)}</dd></div>
      <div><dt>Natureza da operação</dt><dd>{note.operation_nature ?? "Disponível no XML completo"}</dd></div>
    </dl></section>

    <section className="card">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Itens da nota e entrada no estoque</h2>
          <p className="panel-desc">Importar a NF-e não altera o estoque. Confirme o recebimento físico para lançar quantidades e custos; produtos novos serão criados inativos para revisão.</p>
        </div>
        <div className="page-actions">
          {resolved && <Badge tone="ok" dot>{skippedItems.length ? "Conferência concluída" : "Entrada concluída"}</Badge>}
          {!resolved && !!items.rowCount && <Badge tone={enteredItems.length ? "info" : "neutral"}>{enteredItems.length}/{items.rowCount} lançado(s)</Badge>}
          {!!missingItems.length && <Badge tone="warn">{missingItems.length} com falta</Badge>}
          {!!skippedItems.length && !resolved && <Badge>{skippedItems.length} fora do estoque</Badge>}
          {!canReceive && direction === "ENTRY" && receiptItems.length > 0 && !canManageStock && <Badge tone="warn">Exige permissão de estoque</Badge>}
          {!canReceive && direction !== "ENTRY" && !!items.rowCount && <Badge>Nota sem entrada de estoque</Badge>}
          {canReceive && <Modal
            trigger={<><PackageCheck size={16}/>{awaiting.length ? "Dar entrada no estoque" : "Revisar itens"}</>}
            triggerClassName="btn btn-primary"
            title={`Conferir recebimento · NF-e ${note.number ?? ""}`.trim()}
            description="Confirme o que chegou. Só o que for marcado como recebido entra no estoque; o restante você pode lançar depois."
          >
            <ActionForm action={fiscalReceiptAction} submitLabel="Confirmar conferência" className="grid gap-4">
              <input type="hidden" name="invoiceId" value={note.id}/>
              <FiscalReceiptChecklist items={receiptItems.map((item) => ({
                id: item.id,
                name: item.description,
                detail: `${item.product_code ?? "Sem código"} · ${formatQuantity(item.quantity)} ${item.unit ?? ""} × ${unitCost(item) === null ? "—" : formatMoney(unitCost(item)!)}`,
                quantity: Number(item.quantity) || 0,
                unit: item.unit ?? "",
                initial: stateOf(item) === "missing" ? "MISSING" : stateOf(item) === "skipped" ? "SKIPPED" : "RECEIVED",
              }))}/>
              <label className="label">Observação da conferência (opcional)<input className="field" name="observation" maxLength={300} placeholder="Ex.: faltou 1 caixa; fornecedor envia na próxima semana"/></label>
              <p className="field-hint">Esta operação será registrada na auditoria.</p>
            </ActionForm>
          </Modal>}
        </div>
      </div>
      {items.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>#</th><th>Item</th><th className="num">Quantidade</th><th className="num">Custo unitário</th><th className="num">Total</th><th>Estoque</th></tr></thead>
        <tbody>{items.rows.map((item) => {
          const state = stateOf(item);
          const adjustments = [
            item.discount_cents ? `− desconto ${formatMoney(item.discount_cents)}` : null,
            item.freight_cents ? `+ frete ${formatMoney(item.freight_cents)}` : null,
            item.insurance_cents ? `+ seguro ${formatMoney(item.insurance_cents)}` : null,
            item.other_cents ? `+ outros ${formatMoney(item.other_cents)}` : null,
          ].filter(Boolean);
          const partial = state === "entered" && item.received_quantity !== null && item.received_quantity < Number(item.quantity);
          return <tr key={item.id}>
            <td className="muted">{item.item_number}</td>
            <td className="cell-wrap"><span className="cell-main"><b>{item.description}</b><small>Cód. {item.product_code ?? "—"} · EAN {item.ean ?? "—"} · NCM {item.ncm ?? "—"} · CFOP {item.cfop ?? "—"}</small></span></td>
            <td className="num">{formatQuantity(item.quantity)} {item.unit ?? ""}</td>
            <td className="num">{unitCost(item) === null ? "—" : formatMoney(unitCost(item)!)}</td>
            <td className="num"><span className="cell-main"><b>{item.total_cents === null ? "—" : formatMoney(item.total_cents)}</b>{!!adjustments.length && <small>{adjustments.join(" ")}</small>}</span></td>
            <td className="cell-wrap cell-status"><span className="cell-main">
              {state === "entered" && <Badge tone="ok" dot>Entrada realizada</Badge>}
              {state === "reversed" && <Badge tone="danger" dot>Entrada estornada</Badge>}
              {state === "missing" && <Badge tone="warn" dot>Falta registrada</Badge>}
              {state === "skipped" && <Badge dot>Não entra no estoque</Badge>}
              {state === "error" && <Badge tone="danger" dot>Revisar</Badge>}
              {state === "pending" && <Badge tone="info" dot>Aguardando entrada</Badge>}
              {partial && <small className="neg">Recebido {item.received_quantity} de {formatQuantity(item.quantity)} — falta {Number(item.quantity) - item.received_quantity!}</small>}
              {state === "entered" && item.product_active === false && <small>Produto inativo — revise preço e cadastro</small>}
              {["missing", "skipped", "error"].includes(state) && <small>{item.stock_import_error}</small>}
              {item.product_id && <Link className="link text-xs" href={`/admin/products/${item.product_id}`}>{item.product_name ?? item.product_sku}</Link>}
            </span></td>
          </tr>;
        })}</tbody>
      </table></div> : <EmptyState icon={FileText} title="Esta nota não traz os itens" description="O resumo da SEFAZ não contém os itens. O XML integral pode exigir manifestação do destinatário."/>}
    </section>

    <section className="card">
      <div className="panel-head">
        <div><h2 className="panel-title">Duplicatas / contas a pagar</h2><p className="panel-desc">Parcelas extraídas do grupo de cobrança do XML.</p></div>
        {duplicates.rowCount ? <Link className="btn btn-ghost btn-sm" href="/admin/finance">Abrir financeiro</Link> : null}
      </div>
      {duplicates.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Duplicata</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Liquidado</th><th>Status</th></tr></thead>
        <tbody>{duplicates.rows.map((duplicate) => <tr key={duplicate.id}>
          <td><b>{duplicate.source_reference ?? duplicate.installment_number}</b></td>
          <td>{formatDueDate(duplicate.due_date)}</td>
          <td className="num">{formatMoney(duplicate.amount_cents)}</td>
          <td className="num">{formatMoney(duplicate.settled_cents)}</td>
          <td><Badge tone={duplicate.status === "SETTLED" ? "ok" : duplicate.status === "PARTIAL" ? "warn" : duplicate.status === "CANCELED" ? "neutral" : "info"} dot>{duplicateStatus[duplicate.status] ?? duplicate.status}</Badge></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState title="Sem duplicatas" description="Esta NF-e não gerou duplicatas no contas a pagar."/>}
    </section>

    <section className="card">
      <div className="panel-head"><h2 className="panel-title">Eventos fiscais</h2></div>
      {events.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Data</th><th>Tipo</th><th>Protocolo</th><th>Resultado</th></tr></thead>
        <tbody>{events.rows.map((event) => <tr key={event.id}>
          <td>{formatDateTime(event.event_at)}</td>
          <td>{event.event_type ?? "—"}</td>
          <td className="mono">{event.protocol ?? "—"}</td>
          <td className="cell-wrap">{event.status_code ?? "—"} · {event.status_message ?? "—"}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState title="Nenhum evento recebido"/>}
    </section>
  </div>;
}
