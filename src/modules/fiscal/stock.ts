import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { isSplittableSealedProduct } from "@/modules/catalog/classification";

type FiscalStockInput = {
  invoiceId: string;
  accessKey: string;
  number?: string;
  issuerDocument?: string;
  issuerName?: string;
  actorId?: string;
};

type FiscalItemRow = {
  id: string;
  product_code: string | null;
  ean: string | null;
  description: string;
  ncm: string | null;
  cfop: string | null;
  unit: string | null;
  quantity: string | null;
  unit_value_cents: number | null;
  total_cents: number | null;
  discount_cents: number | null;
  freight_cents: number | null;
  insurance_cents: number | null;
  other_cents: number | null;
};

const normalizedDocument = (value?: string) => value?.replace(/\D/g, "").slice(0, 14) || "SEM-DOCUMENTO";
const normalizedCode = (value?: string | null) => value?.trim().toUpperCase().slice(0, 180) || undefined;
const normalizedEan = (value?: string | null) => {
  const candidate = value?.trim();
  return candidate && /^\d{8,14}$/.test(candidate) ? candidate : undefined;
};
const normalizedUnit = (value?: string | null) => value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "UN";

async function catalogDefaults(client: PoolClient, unitCode: string) {
  await client.query("INSERT INTO categories (name,active) SELECT 'Importados via NF-e',true WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name)=lower('Importados via NF-e')) ON CONFLICT DO NOTHING");
  const category = await client.query<{ id: string }>("SELECT id FROM categories WHERE lower(name)=lower('Importados via NF-e') ORDER BY created_at LIMIT 1");
  const unit = await client.query<{ id: string }>(`INSERT INTO units (code,name,active) VALUES ($1,$2,true)
    ON CONFLICT (code) DO UPDATE SET active=true,updated_at=now() RETURNING id`, [unitCode, unitCode === "UN" ? "Unidade" : unitCode]);
  return { categoryId: category.rows[0].id, unitId: unit.rows[0].id };
}

async function resolveProduct(client: PoolClient, item: FiscalItemRow, input: FiscalStockInput, unitCostCents: number) {
  const supplierDocument = normalizedDocument(input.issuerDocument);
  const ean = normalizedEan(item.ean);
  const supplierCode = (normalizedCode(item.product_code) ?? (ean ? `EAN:${ean}` : `DESC:${normalizedCode(item.description)}`))?.slice(0, 180);
  if (!supplierCode) throw new Error("Item fiscal sem código, EAN ou descrição para vinculação ao catálogo.");

  const mapped = await client.query<{ id: string }>(`SELECT p.id FROM supplier_product_mappings m JOIN products p ON p.id=m.product_id
    WHERE m.supplier_document=$1 AND m.supplier_product_code=$2 LIMIT 1`, [supplierDocument, supplierCode]);
  if (mapped.rows[0]) return { productId: mapped.rows[0].id, created: false };

  const byCatalog = await client.query<{ id: string }>(`SELECT id FROM products
    WHERE ($1::text IS NOT NULL AND barcode=$1) OR upper(sku)=$2 OR lower(name)=lower($3)
    ORDER BY CASE WHEN barcode=$1 THEN 0 WHEN upper(sku)=$2 THEN 1 ELSE 2 END,active DESC LIMIT 1`, [ean ?? null, normalizedCode(item.product_code) ?? "", item.description]);
  let productId = byCatalog.rows[0]?.id;
  let created = false;
  if (!productId) {
    const { categoryId, unitId } = await catalogDefaults(client, normalizedUnit(item.unit));
    const hash = createHash("sha256").update(`${supplierDocument}:${supplierCode}`).digest("hex").slice(0, 16).toUpperCase();
    const sku = `NFE-${hash}`;
    const description = [`Importado automaticamente da NF-e.`, input.issuerName ? `Fornecedor: ${input.issuerName}.` : null, item.product_code ? `Código do fornecedor: ${item.product_code}.` : null, item.ncm ? `NCM: ${item.ncm}.` : null, item.cfop ? `CFOP: ${item.cfop}.` : null].filter(Boolean).join(" ");
    const canSplitIntoBoosters = isSplittableSealedProduct(item.description);
    const inserted = await client.query<{ id: string }>(`INSERT INTO products
      (sku,barcode,name,description,category_id,unit_id,cost_cents,sale_price_cents,max_discount_bps,stock_quantity,minimum_stock,can_split_into_boosters,active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7,0,0,0,$8,false) ON CONFLICT (sku) DO NOTHING RETURNING id`, [sku, ean ?? null, item.description.slice(0, 180), description, categoryId, unitId, unitCostCents, canSplitIntoBoosters]);
    productId = inserted.rows[0]?.id;
    created = Boolean(productId);
    if (!productId) productId = (await client.query<{ id: string }>("SELECT id FROM products WHERE sku=$1", [sku])).rows[0]?.id;
    if (!productId) throw new Error("Não foi possível criar ou localizar o produto do item fiscal.");
    if (created) await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FISCAL_PRODUCT_CREATE','product',$2,$3)", [input.actorId ?? null, productId, JSON.stringify({ invoiceId: input.invoiceId, accessKey: input.accessKey, supplierCode, ean, inactive: true })]);
  }
  if (isSplittableSealedProduct(item.description)) await client.query("UPDATE products SET can_split_into_boosters=true,updated_at=now() WHERE id=$1 AND is_loose_booster=false", [productId]);
  await client.query(`INSERT INTO supplier_product_mappings (supplier_document,supplier_product_code,product_id)
    VALUES ($1,$2,$3) ON CONFLICT (supplier_document,supplier_product_code) DO NOTHING`, [supplierDocument, supplierCode, productId]);
  const definitive = await client.query<{ product_id: string }>("SELECT product_id FROM supplier_product_mappings WHERE supplier_document=$1 AND supplier_product_code=$2", [supplierDocument, supplierCode]);
  return { productId: definitive.rows[0]?.product_id ?? productId, created };
}

export type FiscalStockEntryResult = { entered: number; alreadyEntered: number; errors: number };

/** A conferência guarda a decisão sobre o item no campo de observação do estoque; ele é limpo quando o item entra. */
export const FISCAL_ITEM_MISSING_PREFIX = "Falta registrada";
export const FISCAL_ITEM_SKIPPED_PREFIX = "Não entra no estoque";
export const fiscalItemMark = (text?: string | null) => text?.startsWith(FISCAL_ITEM_MISSING_PREFIX) ? "missing" as const : text?.startsWith(FISCAL_ITEM_SKIPPED_PREFIX) ? "skipped" as const : null;

type EntryOutcome = "entered" | "already" | "error";

/** Lança um item da nota no estoque; `receivedQuantity` permite entrada parcial, mantendo o custo unitário da nota. */
async function enterFiscalItem(client: PoolClient, item: FiscalItemRow, input: FiscalStockInput, receivedQuantity?: number): Promise<EntryOutcome> {
  const quantity = Number(item.quantity);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    await client.query("UPDATE fiscal_invoice_items SET stock_import_error=$1 WHERE id=$2", [`Quantidade ${item.quantity ?? "ausente"} não é inteira e positiva.`, item.id]);
    return "error";
  }
  const gross = item.total_cents ?? (item.unit_value_cents === null ? null : item.unit_value_cents * quantity);
  if (gross === null) {
    await client.query("UPDATE fiscal_invoice_items SET stock_import_error='Item sem valor de custo no XML.' WHERE id=$1", [item.id]);
    return "error";
  }
  const totalCost = Math.max(0, gross - (item.discount_cents ?? 0) + (item.freight_cents ?? 0) + (item.insurance_cents ?? 0) + (item.other_cents ?? 0));
  const unitCostCents = Math.round(totalCost / quantity);
  if (!Number.isSafeInteger(unitCostCents) || unitCostCents < 0 || unitCostCents > 2_147_483_647) {
    await client.query("UPDATE fiscal_invoice_items SET stock_import_error='Custo do item fora do limite aceito.' WHERE id=$1", [item.id]);
    return "error";
  }
  const received = receivedQuantity ?? quantity;
  const enteredCost = received === quantity ? totalCost : Math.round((totalCost * received) / quantity);
  const { productId } = await resolveProduct(client, item, input, unitCostCents);
  const product = await client.query<{ stock_quantity: number; cost_cents: number }>("SELECT stock_quantity,cost_cents FROM products WHERE id=$1 FOR UPDATE", [productId]);
  const existing = await client.query("SELECT 1 FROM stock_movements WHERE fiscal_invoice_item_id=$1 AND type='FISCAL_ENTRY'", [item.id]);
  if (existing.rowCount) {
    await client.query("UPDATE fiscal_invoice_items SET product_id=$1,stock_import_error=NULL WHERE id=$2", [productId, item.id]);
    return "already";
  }
  const previous = product.rows[0].stock_quantity;
  const next = previous + received;
  const averageCost = next === 0 ? unitCostCents : Math.round((previous * product.rows[0].cost_cents + enteredCost) / next);
  const reference = input.number ?? input.accessKey;
  await client.query("UPDATE products SET stock_quantity=$1,cost_cents=$2,updated_at=now() WHERE id=$3", [next, averageCost, productId]);
  await client.query(`INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,fiscal_invoice_item_id,user_id,notes)
    VALUES ($1,'FISCAL_ENTRY',$2,$3,$4,$5,$6,$7)`, [productId, received, previous, next, item.id, input.actorId ?? null, received === quantity ? `Entrada confirmada da NF-e ${reference}` : `Entrada parcial da NF-e ${reference}: recebidas ${received} de ${quantity}`]);
  await client.query("UPDATE fiscal_invoice_items SET product_id=$1,stock_unit_cost_cents=$2,stock_imported_at=now(),stock_reversed_at=NULL,stock_import_error=NULL WHERE id=$3", [productId, unitCostCents, item.id]);
  await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FISCAL_STOCK_ENTRY','fiscal_invoice_item',$2,$3)", [input.actorId ?? null, item.id, JSON.stringify({ invoiceId: input.invoiceId, productId, quantity: received, invoicedQuantity: quantity, unitCostCents, previousQuantity: previous, newQuantity: next })]);
  return "entered";
}

export async function importFiscalInvoiceToStock(client: PoolClient, input: FiscalStockInput): Promise<FiscalStockEntryResult> {
  const summary: FiscalStockEntryResult = { entered: 0, alreadyEntered: 0, errors: 0 };
  const items = await client.query<FiscalItemRow>(`SELECT id,product_code,ean,description,ncm,cfop,unit,quantity,
    unit_value_cents::float8,total_cents::float8,discount_cents::float8,freight_cents::float8,insurance_cents::float8,other_cents::float8
    FROM fiscal_invoice_items WHERE invoice_id=$1 AND (stock_import_error IS NULL OR stock_import_error NOT LIKE $2) ORDER BY item_number`, [input.invoiceId, `${FISCAL_ITEM_SKIPPED_PREFIX}%`]);
  for (const item of items.rows) {
    const outcome = await enterFiscalItem(client, item, input);
    if (outcome === "entered") summary.entered++;
    else if (outcome === "already") summary.alreadyEntered++;
    else summary.errors++;
  }
  return summary;
}

/** Bloqueia a nota e garante que ela pode movimentar o estoque da loja. */
async function lockEntryInvoice(client: PoolClient, invoiceId: string) {
  const invoice = await client.query<{
    id: string; access_key: string; number: string | null; status: string; has_full_xml: boolean;
    issuer_cnpj_cpf: string | null; issuer_name: string | null; recipient_cnpj_cpf: string | null; company_cnpj: string;
  }>(`SELECT f.id,f.access_key,f.number,f.status,f.has_full_xml,f.issuer_cnpj_cpf,f.issuer_name,f.recipient_cnpj_cpf,s.company_cnpj
    FROM fiscal_invoices f JOIN sefaz_sync_states s ON s.id=f.sync_state_id WHERE f.id=$1 FOR UPDATE OF f`, [invoiceId]);
  const note = invoice.rows[0];
  if (!note) throw new AppError("Nota fiscal não encontrada.", 404);
  if (!note.has_full_xml) throw new AppError("Obtenha o XML completo antes de dar entrada no estoque.", 409);
  if (note.status !== "AUTHORIZED") throw new AppError("Somente uma NF-e autorizada pode dar entrada no estoque.", 409);
  const recipient = note.recipient_cnpj_cpf?.replace(/\D/g, "");
  if (!recipient || recipient !== note.company_cnpj.replace(/\D/g, "")) throw new AppError("Somente notas de entrada emitidas para a loja podem movimentar o estoque.", 409);
  const itemCount = await client.query<{ total: number }>("SELECT count(*)::int total FROM fiscal_invoice_items WHERE invoice_id=$1", [invoiceId]);
  if (!itemCount.rows[0].total) throw new AppError("A nota fiscal não possui itens disponíveis para entrada.", 409);
  return note;
}

const stockInput = (invoiceId: string, note: Awaited<ReturnType<typeof lockEntryInvoice>>, actorId?: string): FiscalStockInput => ({
  invoiceId,
  actorId,
  accessKey: note.access_key,
  number: note.number ?? undefined,
  issuerName: note.issuer_name ?? undefined,
  issuerDocument: note.issuer_cnpj_cpf ?? undefined,
});

export async function receiveFiscalInvoiceStock(invoiceId: string, actorId?: string): Promise<FiscalStockEntryResult> {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new AppError("Nota fiscal inválida.", 422);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const note = await lockEntryInvoice(client, invoiceId);
    const result = await importFiscalInvoiceToStock(client, stockInput(invoiceId, note, actorId));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type FiscalReceiptDecision = { itemId: string; action: "RECEIVED" | "MISSING" | "SKIPPED"; quantity?: number };
export type FiscalReceiptResult = FiscalStockEntryResult & { missing: number; skipped: number };

/** Conferência de recebimento: lança só o que chegou, registra faltas e dispensa itens que não entram no estoque. */
export async function receiveFiscalInvoiceItems(invoiceId: string, decisions: FiscalReceiptDecision[], actor: { id: string; name: string }, observation?: string): Promise<FiscalReceiptResult> {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new AppError("Nota fiscal inválida.", 422);
  const unique = new Map(decisions.map((decision) => [decision.itemId, decision]));
  if (!unique.size) throw new AppError("Nenhum item foi informado na conferência.", 422);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const note = await lockEntryInvoice(client, invoiceId);
    const rows = await client.query<FiscalItemRow & { stock_imported_at: Date | null; stock_reversed_at: Date | null }>(`SELECT id,product_code,ean,description,ncm,cfop,unit,quantity,
      unit_value_cents::float8,total_cents::float8,discount_cents::float8,freight_cents::float8,insurance_cents::float8,other_cents::float8,stock_imported_at,stock_reversed_at
      FROM fiscal_invoice_items WHERE invoice_id=$1 AND id=ANY($2::uuid[]) ORDER BY item_number FOR UPDATE`, [invoiceId, [...unique.keys()]]);
    if (rows.rowCount !== unique.size) throw new AppError("Um ou mais itens não pertencem a esta nota fiscal.", 422);

    const input = stockInput(invoiceId, note, actor.id);
    const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date());
    const comment = observation?.trim().slice(0, 300);
    const result: FiscalReceiptResult = { entered: 0, alreadyEntered: 0, errors: 0, missing: 0, skipped: 0 };
    for (const item of rows.rows) {
      const decision = unique.get(item.id)!;
      if (item.stock_imported_at && !item.stock_reversed_at) { result.alreadyEntered++; continue; }
      if (decision.action === "RECEIVED") {
        const invoiced = Number(item.quantity);
        const received = decision.quantity ?? invoiced;
        if (!Number.isInteger(received) || received <= 0) throw new AppError(`Informe uma quantidade recebida válida para "${item.description}".`, 422);
        if (received > invoiced) throw new AppError(`A quantidade recebida de "${item.description}" não pode ser maior que a da nota (${invoiced}).`, 422);
        const outcome = await enterFiscalItem(client, item, input, received);
        if (outcome === "entered") result.entered++;
        else if (outcome === "already") result.alreadyEntered++;
        else result.errors++;
        continue;
      }
      const prefix = decision.action === "MISSING" ? FISCAL_ITEM_MISSING_PREFIX : FISCAL_ITEM_SKIPPED_PREFIX;
      const text = `${prefix} em ${when} por ${actor.name}.${comment ? ` ${comment}` : ""}`;
      await client.query("UPDATE fiscal_invoice_items SET stock_import_error=$1 WHERE id=$2 AND stock_imported_at IS NULL", [text, item.id]);
      await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,$2,'fiscal_invoice_item',$3,$4)", [actor.id, decision.action === "MISSING" ? "FISCAL_STOCK_ITEM_MISSING" : "FISCAL_STOCK_ITEM_SKIPPED", item.id, JSON.stringify({ invoiceId, description: item.description, invoicedQuantity: Number(item.quantity), observation: comment ?? null })]);
      if (decision.action === "MISSING") result.missing++; else result.skipped++;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelFiscalInvoiceStock(client: PoolClient, invoiceId: string, actorId?: string) {
  const entries = await client.query<{ item_id: string; product_id: string; quantity_delta: number }>(`SELECT i.id item_id,m.product_id,m.quantity_delta
    FROM fiscal_invoice_items i JOIN stock_movements m ON m.fiscal_invoice_item_id=i.id AND m.type='FISCAL_ENTRY'
    WHERE i.invoice_id=$1 AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.fiscal_invoice_item_id=i.id AND r.type='FISCAL_CANCELLATION')
    ORDER BY m.product_id,i.item_number`, [invoiceId]);
  for (const entry of entries.rows) {
    const product = await client.query<{ stock_quantity: number }>("SELECT stock_quantity FROM products WHERE id=$1 FOR UPDATE", [entry.product_id]);
    const previous = product.rows[0].stock_quantity;
    if (previous < entry.quantity_delta) {
      await client.query("UPDATE fiscal_invoice_items SET stock_import_error=$1 WHERE id=$2", [`Cancelamento fiscal não estornado: saldo atual ${previous}, entrada original ${entry.quantity_delta}.`, entry.item_id]);
      await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FISCAL_STOCK_CANCELLATION_PENDING','fiscal_invoice_item',$2,$3)", [actorId ?? null, entry.item_id, JSON.stringify({ invoiceId, productId: entry.product_id, currentQuantity: previous, originalEntry: entry.quantity_delta })]);
      continue;
    }
    const next = previous - entry.quantity_delta;
    await client.query("UPDATE products SET stock_quantity=$1,updated_at=now() WHERE id=$2", [next, entry.product_id]);
    await client.query(`INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,fiscal_invoice_item_id,user_id,notes)
      VALUES ($1,'FISCAL_CANCELLATION',$2,$3,$4,$5,$6,'Estorno automático por cancelamento da NF-e')`, [entry.product_id, -entry.quantity_delta, previous, next, entry.item_id, actorId ?? null]);
    await client.query("UPDATE fiscal_invoice_items SET stock_reversed_at=now(),stock_import_error=NULL WHERE id=$1", [entry.item_id]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FISCAL_STOCK_CANCELLATION','fiscal_invoice_item',$2,$3)", [actorId ?? null, entry.item_id, JSON.stringify({ invoiceId, productId: entry.product_id, quantity: entry.quantity_delta, previousQuantity: previous, newQuantity: next })]);
  }
}
