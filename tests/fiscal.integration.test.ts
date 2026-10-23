import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eventSummaryXml, fullXml, summaryXml } from "./fixtures/fiscal";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("sincronização fiscal com PostgreSQL", () => {
  let pool: typeof import("@/db").pool;
  let syncSefazDfe: typeof import("@/modules/fiscal/service").syncSefazDfe;
  let importFiscalXmlBatch: typeof import("@/modules/fiscal/service").importFiscalXmlBatch;
  let receiveFiscalInvoiceStock: typeof import("@/modules/fiscal/stock").receiveFiscalInvoiceStock;
  const config = { enabled: true, environment: "HOMOLOGATION" as const, cnpj: "98765432000199", ufCode: 35, certificateBase64: "AA==", certificatePassword: "teste", endpoint: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx", intervalMinutes: 60, maxBatches: 20 };

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL = url;
    ({ pool } = await import("@/db"));
    ({ syncSefazDfe, importFiscalXmlBatch } = await import("@/modules/fiscal/service"));
    ({ receiveFiscalInvoiceStock } = await import("@/modules/fiscal/stock"));
  });
  beforeEach(async () => { await pool.query("TRUNCATE financial_settlements,financial_installments,financial_accounts,stock_movements,supplier_product_mappings,fiscal_invoice_events,fiscal_invoice_items,fiscal_invoices,fiscal_dfe_documents,fiscal_import_batches,sefaz_sync_states,products,categories,units CASCADE"); });
  afterAll(async () => { await pool?.end(); });

  const invoiceId = async () => (await pool.query<{ id: string }>("SELECT id FROM fiscal_invoices LIMIT 1")).rows[0].id;

  it("persiste NSU, XML, evento, nota normalizada e itens atomicamente", async () => {
    const distribute = vi.fn().mockResolvedValue({ statusCode: "138", statusMessage: "Documentos localizados", lastNsu: "000000000000003", maxNsu: "000000000000003", documents: [{ nsu: "000000000000001", schema: "resEvento_v1.01.xsd", xml: eventSummaryXml }, { nsu: "000000000000002", schema: "resNFe_v1.01.xsd", xml: summaryXml }, { nsu: "000000000000003", schema: "procNFe_v4.00.xsd", xml: fullXml }] });
    const result = await syncSefazDfe(undefined, { config, distribute });
    expect(result).toMatchObject({ status: "completed", documents: 3, lastNsu: "000000000000003" });
    expect((await pool.query("SELECT last_nsu,max_nsu FROM sefaz_sync_states")).rows[0]).toEqual({ last_nsu: "000000000000003", max_nsu: "000000000000003" });
    expect((await pool.query("SELECT has_full_xml,total_cents,number,status FROM fiscal_invoices")).rows[0]).toMatchObject({ has_full_xml: true, total_cents: "123456", number: "123", status: "CANCELED" });
    expect((await pool.query("SELECT description FROM fiscal_invoice_items")).rows[0].description).toBe("Display de boosters Magic");
    expect((await pool.query("SELECT event_type,invoice_id FROM fiscal_invoice_events")).rows[0]).toMatchObject({ event_type: "110111", invoice_id: expect.any(String) });
    expect((await pool.query("SELECT count(*)::int total FROM products")).rows[0].total).toBe(0);
    const deferred = await syncSefazDfe(undefined, { config, distribute });
    expect(deferred.status).toBe("deferred");
    expect(distribute).toHaveBeenCalledTimes(1);
  });

  it("aguarda confirmação para lançar uma NF-e da SEFAZ no estoque", async () => {
    const distribute = vi.fn().mockResolvedValue({ statusCode: "138", statusMessage: "Documento localizado", lastNsu: "000000000000001", maxNsu: "000000000000001", documents: [{ nsu: "000000000000001", schema: "procNFe_v4.00.xsd", xml: fullXml }] });
    await syncSefazDfe(undefined, { config, distribute });
    expect((await pool.query("SELECT count(*)::int total FROM products")).rows[0].total).toBe(0);
    expect((await pool.query("SELECT count(*)::int total FROM stock_movements")).rows[0].total).toBe(0);
    expect(await receiveFiscalInvoiceStock(await invoiceId())).toEqual({ entered: 1, alreadyEntered: 0, errors: 0 });
    expect((await pool.query("SELECT stock_quantity,cost_cents,active FROM products")).rows[0]).toMatchObject({ stock_quantity: 2, cost_cents: 61728, active: false });
    expect((await pool.query("SELECT type,quantity_delta FROM stock_movements")).rows).toEqual([{ type: "FISCAL_ENTRY", quantity_delta: 2 }]);
    expect(await receiveFiscalInvoiceStock(await invoiceId())).toEqual({ entered: 0, alreadyEntered: 1, errors: 0 });
    expect((await pool.query("SELECT stock_quantity FROM products")).rows[0].stock_quantity).toBe(2);
  });

  it("recupera por chave o XML completo sem lançar estoque automaticamente", async () => {
    const distribute = vi.fn().mockResolvedValue({ statusCode: "138", statusMessage: "Documento localizado", lastNsu: "000000000000001", maxNsu: "000000000000001", documents: [{ nsu: "000000000000001", schema: "resNFe_v1.01.xsd", xml: summaryXml }] });
    const queryByAccessKey = vi.fn().mockResolvedValue({ statusCode: "138", statusMessage: "Documento localizado", lastNsu: "000000000000001", maxNsu: "000000000000001", documents: [{ nsu: "000000000000001", schema: "procNFe_v4.00.xsd", xml: fullXml }] });
    const result = await syncSefazDfe(undefined, { config, distribute, queryByAccessKey });
    expect(queryByAccessKey).toHaveBeenCalledWith(config, expect.any(String));
    expect(result).toMatchObject({ status: "completed", recovered: 1, documents: 2 });
    expect((await pool.query("SELECT has_full_xml FROM fiscal_invoices")).rows[0].has_full_xml).toBe(true);
    expect((await pool.query("SELECT count(*)::int total FROM fiscal_invoice_items")).rows[0].total).toBe(1);
    expect((await pool.query("SELECT count(*)::int total FROM products")).rows[0].total).toBe(0);
  });

  it("adota o último NSU informado pela rejeição 656 e bloqueia nova tentativa", async () => {
    const distribute = vi.fn().mockResolvedValue({ statusCode: "656", statusMessage: "Consumo Indevido", lastNsu: "000000000000736", maxNsu: "000000000000736", documents: [] });
    await expect(syncSefazDfe(undefined, { config, distribute })).rejects.toThrow("SEFAZ 656");
    const state = (await pool.query("SELECT last_nsu,max_nsu,next_sync_at FROM sefaz_sync_states")).rows[0];
    expect(state).toMatchObject({ last_nsu: "000000000000736", max_nsu: "000000000000736" });
    expect(new Date(state.next_sync_at).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });

  it("importa XML e duplicatas, mas só cria produto e estoque após confirmação", async () => {
    const result = await importFiscalXmlBatch([{ name: "nota-123.xml", xml: fullXml }, { name: "copia.xml", xml: fullXml }], undefined, config);
    expect(result).toMatchObject({ fileCount: 2, importedCount: 1, duplicateCount: 1, failedCount: 0 });
    expect((await pool.query("SELECT nsu,original_file_name,content_hash,import_batch_id FROM fiscal_dfe_documents")).rows[0]).toMatchObject({ nsu: null, original_file_name: "nota-123.xml", content_hash: expect.stringMatching(/^[a-f0-9]{64}$/), import_batch_id: result.batchId });
    const accounts = await pool.query("SELECT id,type,description,counterparty_name,total_cents,status,fiscal_invoice_id,created_by_id FROM financial_accounts WHERE fiscal_invoice_id IS NOT NULL");
    expect(accounts.rows[0]).toMatchObject({ type: "PAYABLE", description: "NF-e 123 · Série 1", counterparty_name: "Distribuidora Coliseu", total_cents: 123456, status: "OPEN", fiscal_invoice_id: expect.any(String), created_by_id: null });
    expect((await pool.query("SELECT installment_number,source_reference,due_date::text,amount_cents,status FROM financial_installments WHERE account_id=$1 ORDER BY installment_number", [accounts.rows[0].id])).rows).toEqual([{ installment_number: 1, source_reference: "001", due_date: "2026-11-13", amount_cents: 61728, status: "OPEN" }, { installment_number: 2, source_reference: "002", due_date: "2026-12-13", amount_cents: 61728, status: "OPEN" }]);
    expect((await pool.query("SELECT count(*)::int total FROM products")).rows[0].total).toBe(0);

    await receiveFiscalInvoiceStock(accounts.rows[0].fiscal_invoice_id);
    const product = (await pool.query("SELECT id,name,cost_cents,sale_price_cents,stock_quantity,active,can_split_into_boosters FROM products")).rows[0];
    expect(product).toMatchObject({ name: "Display de boosters Magic", cost_cents: 61728, sale_price_cents: 61728, stock_quantity: 2, active: false, can_split_into_boosters: true });
    expect((await pool.query("SELECT product_id,stock_unit_cost_cents,stock_imported_at,stock_import_error FROM fiscal_invoice_items")).rows[0]).toMatchObject({ product_id: product.id, stock_unit_cost_cents: 61728, stock_imported_at: expect.any(Date), stock_import_error: null });

    await pool.query("DELETE FROM financial_installments WHERE account_id=$1", [accounts.rows[0].id]);
    await pool.query("DELETE FROM financial_accounts WHERE id=$1", [accounts.rows[0].id]);
    const backfill = await importFiscalXmlBatch([{ name: "reprocessada.xml", xml: fullXml }], undefined, config);
    expect(backfill).toMatchObject({ importedCount: 0, duplicateCount: 1, failedCount: 0 });
    expect((await pool.query("SELECT count(*)::int total FROM financial_accounts WHERE fiscal_invoice_id IS NOT NULL")).rows[0].total).toBe(1);
    expect((await pool.query("SELECT stock_quantity FROM products WHERE id=$1", [product.id])).rows[0].stock_quantity).toBe(2);
    expect((await pool.query("SELECT count(*)::int total FROM stock_movements WHERE type='FISCAL_ENTRY'")).rows[0].total).toBe(1);
  });

  it("vincula por EAN e atualiza estoque e custo médio ao confirmar", async () => {
    const category = (await pool.query("INSERT INTO categories(name) VALUES ('TCG') RETURNING id")).rows[0];
    const unit = (await pool.query("INSERT INTO units(code,name) VALUES ('UN','Unidade') RETURNING id")).rows[0];
    const product = (await pool.query("INSERT INTO products(sku,barcode,name,category_id,unit_id,cost_cents,sale_price_cents,stock_quantity,minimum_stock,active) VALUES ('EXISTENTE','7891234567890','Produto existente',$1,$2,500,1000,10,1,true) RETURNING id", [category.id, unit.id])).rows[0];
    const xml = fullXml.replace("SEM GTIN", "7891234567890");
    await importFiscalXmlBatch([{ name: "ean.xml", xml }], undefined, config);
    expect((await pool.query("SELECT stock_quantity FROM products WHERE id=$1", [product.id])).rows[0].stock_quantity).toBe(10);
    await receiveFiscalInvoiceStock(await invoiceId());
    expect((await pool.query("SELECT count(*)::int total FROM products")).rows[0].total).toBe(1);
    expect((await pool.query("SELECT stock_quantity,cost_cents,sale_price_cents,active FROM products WHERE id=$1", [product.id])).rows[0]).toMatchObject({ stock_quantity: 12, cost_cents: 10705, sale_price_cents: 1000, active: true });
    expect((await pool.query("SELECT product_id FROM supplier_product_mappings WHERE supplier_product_code='MTG-BOX'")).rows[0].product_id).toBe(product.id);
  });

  it("sinaliza quantidade fracionária somente ao tentar dar entrada", async () => {
    const xml = fullXml.replace("2.0000", "2.5000");
    await importFiscalXmlBatch([{ name: "fracionada.xml", xml }], undefined, config);
    expect((await pool.query("SELECT stock_import_error FROM fiscal_invoice_items")).rows[0].stock_import_error).toBeNull();
    expect(await receiveFiscalInvoiceStock(await invoiceId())).toEqual({ entered: 0, alreadyEntered: 0, errors: 1 });
    expect((await pool.query("SELECT count(*)::int total FROM products")).rows[0].total).toBe(0);
    expect((await pool.query("SELECT stock_import_error FROM fiscal_invoice_items")).rows[0].stock_import_error).toContain("não é inteira e positiva");
  });

  it("cancela duplicatas e estorna uma entrada já confirmada", async () => {
    await importFiscalXmlBatch([{ name: "nota-123.xml", xml: fullXml }], undefined, config);
    await receiveFiscalInvoiceStock(await invoiceId());
    const distribute = vi.fn().mockResolvedValue({ statusCode: "138", statusMessage: "Documento localizado", lastNsu: "000000000000001", maxNsu: "000000000000001", documents: [{ nsu: "000000000000001", schema: "resEvento_v1.01.xsd", xml: eventSummaryXml }] });
    await syncSefazDfe(undefined, { config, distribute });
    expect((await pool.query("SELECT status FROM fiscal_invoices")).rows[0].status).toBe("CANCELED");
    expect((await pool.query("SELECT status FROM financial_accounts WHERE fiscal_invoice_id IS NOT NULL")).rows[0].status).toBe("CANCELED");
    expect((await pool.query("SELECT stock_quantity FROM products")).rows[0].stock_quantity).toBe(0);
    expect((await pool.query("SELECT type,quantity_delta FROM stock_movements ORDER BY created_at")).rows).toEqual([{ type: "FISCAL_ENTRY", quantity_delta: 2 }, { type: "FISCAL_CANCELLATION", quantity_delta: -2 }]);
    expect((await pool.query("SELECT stock_reversed_at,stock_import_error FROM fiscal_invoice_items")).rows[0]).toMatchObject({ stock_reversed_at: expect.any(Date), stock_import_error: null });
  });

  it("rejeita no lote uma NF-e de outro CNPJ sem impedir os demais arquivos", async () => {
    const other = fullXml.replace("98765432000199", "11111111000191");
    const result = await importFiscalXmlBatch([{ name: "valida.xml", xml: fullXml }, { name: "outro-cnpj.xml", xml: other }], undefined, config);
    expect(result).toMatchObject({ importedCount: 1, failedCount: 1 });
    expect(result.results[1]).toMatchObject({ status: "FAILED", message: "A NF-e não pertence ao CNPJ configurado no sistema." });
  });
});
