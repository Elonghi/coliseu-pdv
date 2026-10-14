import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

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
    const inserted = await client.query<{ id: string }>(`INSERT INTO products
      (sku,barcode,name,description,category_id,unit_id,cost_cents,sale_price_cents,max_discount_bps,stock_quantity,minimum_stock,active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7,0,0,0,false) ON CONFLICT (sku) DO NOTHING RETURNING id`, [sku, ean ?? null, item.description.slice(0, 180), description, categoryId, unitId, unitCostCents]);
    productId = inserted.rows[0]?.id;
    created = Boolean(productId);
    if (!productId) productId = (await client.query<{ id: string }>("SELECT id FROM products WHERE sku=$1", [sku])).rows[0]?.id;
    if (!productId) throw new Error("Não foi possível criar ou localizar o produto do item fiscal.");
    if (created) await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FISCAL_PRODUCT_CREATE','product',$2,$3)", [input.actorId ?? null, productId, JSON.stringify({ invoiceId: input.invoiceId, accessKey: input.accessKey, supplierCode, ean, inactive: true })]);
  }
  await client.query(`INSERT INTO supplier_product_mappings (supplier_document,supplier_product_code,product_id)
    VALUES ($1,$2,$3) ON CONFLICT (supplier_document,supplier_product_code) DO NOTHING`, [supplierDocument, supplierCode, productId]);
  const definitive = await client.query<{ product_id: string }>("SELECT product_id FROM supplier_product_mappings WHERE supplier_document=$1 AND supplier_product_code=$2", [supplierDocument, supplierCode]);
  return { productId: definitive.rows[0]?.product_id ?? productId, created };
}

export async function importFiscalInvoiceToStock(client: PoolClient, input: FiscalStockInput) {
  const items = await client.query<FiscalItemRow>(`SELECT id,product_code,ean,description,ncm,cfop,unit,quantity,
    unit_value_cents::float8,total_cents::float8,discount_cents::float8,freight_cents::float8,insurance_cents::float8,other_cents::float8
    FROM fiscal_invoice_items WHERE invoice_id=$1 ORDER BY item_number`, [input.invoiceId]);
  for (const item of items.rows) {
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      await client.query("UPDATE fiscal_invoice_items SET stock_import_error=$1 WHERE id=$2", [`Quantidade ${item.quantity ?? "ausente"} não é inteira e positiva.`, item.id]);
      continue;
    }
    const gross = item.total_cents ?? (item.unit_value_cents === null ? null : item.unit_value_cents * quantity);
    if (gross === null) {
      await client.query("UPDATE fiscal_invoice_items SET stock_import_error='Item sem valor de custo no XML.' WHERE id=$1", [item.id]);
      continue;
    }
    const totalCost = Math.max(0, gross - (item.discount_cents ?? 0) + (item.freight_cents ?? 0) + (item.insurance_cents ?? 0) + (item.other_cents ?? 0));
    const unitCostCents = Math.round(totalCost / quantity);
    if (!Number.isSafeInteger(unitCostCents) || unitCostCents < 0 || unitCostCents > 2_147_483_647) {
      await client.query("UPDATE fiscal_invoice_items SET stock_import_error='Custo do item fora do limite aceito.' WHERE id=$1", [item.id]);
      continue;
    }
    const { productId } = await resolveProduct(client, item, input, unitCostCents);
    const product = await client.query<{ stock_quantity: number; cost_cents: number }>("SELECT stock_quantity,cost_cents FROM products WHERE id=$1 FOR UPDATE", [productId]);
    const existing = await client.query("SELECT 1 FROM stock_movements WHERE fiscal_invoice_item_id=$1 AND type='FISCAL_ENTRY'", [item.id]);
    if (existing.rowCount) {
      await client.query("UPDATE fiscal_invoice_items SET product_id=$1,stock_import_error=NULL WHERE id=$2", [productId, item.id]);
      continue;
    }
    const previous = product.rows[0].stock_quantity;
    const next = previous + quantity;
    const averageCost = next === 0 ? unitCostCents : Math.round((previous * product.rows[0].cost_cents + totalCost) / next);
    await client.query("UPDATE products SET stock_quantity=$1,cost_cents=$2,updated_at=now() WHERE id=$3", [next, averageCost, productId]);
    await client.query(`INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,fiscal_invoice_item_id,user_id,notes)
      VALUES ($1,'FISCAL_ENTRY',$2,$3,$4,$5,$6,$7)`, [productId, quantity, previous, next, item.id, input.actorId ?? null, `Entrada automática da NF-e ${input.number ?? input.accessKey}`]);
    await client.query("UPDATE fiscal_invoice_items SET product_id=$1,stock_unit_cost_cents=$2,stock_imported_at=now(),stock_reversed_at=NULL,stock_import_error=NULL WHERE id=$3", [productId, unitCostCents, item.id]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FISCAL_STOCK_ENTRY','fiscal_invoice_item',$2,$3)", [input.actorId ?? null, item.id, JSON.stringify({ invoiceId: input.invoiceId, productId, quantity, unitCostCents, previousQuantity: previous, newQuantity: next })]);
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
