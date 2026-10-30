import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fullXml } from "./fixtures/fiscal";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const script = path.resolve("scripts/reset-to-invoice-entry.mjs");
const confirmation = "REABRIR_NOTAS_PARA_ENTRADA";

suite("script que reabre as notas para entrada de estoque", () => {
  let pool: typeof import("@/db").pool;
  let importFiscalXmlBatch: typeof import("@/modules/fiscal/service").importFiscalXmlBatch;
  let receiveFiscalInvoiceStock: typeof import("@/modules/fiscal/stock").receiveFiscalInvoiceStock;
  let settleFinancialInstallment: typeof import("@/modules/finance/service").settleFinancialInstallment;
  let createSale: typeof import("@/modules/sales/service").createSale;
  let adminId: string;
  let operatorId: string;
  let storage: string;
  const imageKey = "products/foto-teste.jpg";
  const config = { enabled: true, environment: "HOMOLOGATION" as const, cnpj: "98765432000199", ufCode: 35, certificateBase64: "AA==", certificatePassword: "teste", endpoint: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx", intervalMinutes: 60, maxBatches: 20 };

  const run = (extra: string[] = [], env: Record<string, string> = {}) => execFileSync(process.execPath, [script, ...extra], { env: { ...process.env, DATABASE_URL: url!, STORAGE_PATH: storage, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const databaseName = () => new URL(url!).pathname.slice(1);
  const count = async (table: string) => (await pool.query<{ total: number }>(`SELECT count(*)::int total FROM ${table}`)).rows[0].total;

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL = url;
    ({ pool } = await import("@/db"));
    ({ importFiscalXmlBatch } = await import("@/modules/fiscal/service"));
    ({ receiveFiscalInvoiceStock } = await import("@/modules/fiscal/stock"));
    ({ settleFinancialInstallment } = await import("@/modules/finance/service"));
    ({ createSale } = await import("@/modules/sales/service"));
  });
  afterAll(async () => { await pool?.end(); await rm(storage, { recursive: true, force: true }); });

  beforeEach(async () => {
    await pool.query("TRUNCATE audit_logs,bank_imports,cash_registers,inventory_counts,purchase_orders,suppliers,financial_settlements,financial_installments,player_credit_movements,financial_accounts,stock_movements,product_splits,payments,sale_items,sales,supplier_product_mappings,fiscal_invoice_events,fiscal_invoice_items,fiscal_invoices,fiscal_dfe_documents,fiscal_import_batches,sefaz_sync_states,players,products,categories,units,payment_methods,users RESTART IDENTITY CASCADE");
    const users = await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role) VALUES ('Admin','admin@reset.test','x','ADMIN'),('Operador','op@reset.test','x','OPERATOR') RETURNING id");
    [adminId, operatorId] = users.rows.map((row) => row.id);
    await pool.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('CASH','Dinheiro',0),('PIX','PIX',1),('PLAYER_CREDIT','Crédito',2),('FUTURE','Futuro',3)");

    // Operação "suja": nota com entrada, baixa de duplicata, venda, caixa, jogador com saldo, compra e inventário.
    await importFiscalXmlBatch([{ name: "nota-123.xml", xml: fullXml }], undefined, config);
    const invoiceId = (await pool.query<{ id: string }>("SELECT id FROM fiscal_invoices LIMIT 1")).rows[0].id;
    await receiveFiscalInvoiceStock(invoiceId, adminId);
    await pool.query("UPDATE products SET active=true");
    storage = await mkdtemp(path.join(tmpdir(), "reset-storage-"));
    await mkdir(path.join(storage, "products"), { recursive: true });
    await writeFile(path.join(storage, imageKey), "foto");
    await pool.query("UPDATE products SET image_key=$1", [imageKey]);
    const installmentId = (await pool.query<{ id: string }>("SELECT id FROM financial_installments ORDER BY installment_number LIMIT 1")).rows[0].id;
    await settleFinancialInstallment({ installmentId, amountCents: 1000, methodCode: "PIX", occurredAt: "2026-10-10T10:00" }, adminId);
    const register = (await pool.query<{ id: string }>("INSERT INTO cash_registers(name) VALUES ('Caixa reset') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO cash_sessions(register_id,operator_id,opening_amount_cents) VALUES ($1,$2,10000)", [register, operatorId]);
    const product = (await pool.query<{ id: string; sale_price_cents: number }>("SELECT id,sale_price_cents FROM products LIMIT 1")).rows[0];
    await createSale({ items: [{ productId: product.id, quantity: 1, discountBasisPoints: 0 }], payments: [{ methodCode: "PIX", amountAppliedCents: product.sale_price_cents }] }, operatorId);
    await pool.query("INSERT INTO players(name,credit_balance_cents) VALUES ('Jogador reset',500)");
    const supplier = (await pool.query<{ id: string }>("INSERT INTO suppliers(name) VALUES ('Fornecedor reset') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO purchase_orders(supplier_id,created_by_id) VALUES ($1,$2)", [supplier, adminId]);
    await pool.query("INSERT INTO inventory_counts(name,created_by_id) VALUES ('Contagem reset',$1)", [adminId]);
    const settlementId = (await pool.query<{ id: string }>("SELECT id FROM financial_settlements LIMIT 1")).rows[0].id;
    const bankImport = (await pool.query<{ id: string }>("INSERT INTO bank_imports(file_name,imported_by_id) VALUES ('extrato.ofx',$1) RETURNING id", [adminId])).rows[0].id;
    await pool.query("INSERT INTO bank_transactions(import_id,external_id,occurred_on,amount_cents,settlement_id,reconciled_at,reconciled_by_id) VALUES ($1,'T1','2026-10-10',-1000,$2,now(),$3)", [bankImport, settlementId, adminId]);
  });

  it("a simulação mostra os números e não grava nada", async () => {
    const output = run();
    expect(output).toContain("SIMULAÇÃO");
    expect(output).toContain("NADA foi gravado");
    expect(await count("sales")).toBe(1);
    expect(await count("financial_settlements")).toBe(1);
    expect((await pool.query("SELECT stock_quantity FROM products")).rows[0].stock_quantity).toBe(1);
    expect((await pool.query("SELECT stock_imported_at FROM fiscal_invoice_items")).rows[0].stock_imported_at).not.toBeNull();
    expect(await count("supplier_product_mappings")).toBe(1);
    expect(existsSync(path.join(storage, imageKey))).toBe(true);
  });

  it("recusa aplicar sem a confirmação ou com o nome de banco errado", async () => {
    expect(() => run(["--apply", `--db=${databaseName()}`])).toThrow(/CONFIRM_REOPEN_INVOICES/);
    expect(() => run(["--apply", "--db=outro_banco"], { CONFIRM_REOPEN_INVOICES: confirmation })).toThrow(/--db=/);
    expect(() => run(["--apply"], { CONFIRM_REOPEN_INVOICES: confirmation })).toThrow(/--db=/);
    expect(await count("sales")).toBe(1);
    expect(await count("products")).toBe(1);
    expect(existsSync(path.join(storage, imageKey))).toBe(true);
  });

  it("zera o sistema, mantém as notas e permite dar entrada de novo", async () => {
    const output = run(["--apply", `--db=${databaseName()}`], { CONFIRM_REOPEN_INVOICES: confirmation });
    expect(output).toContain("Concluído e gravado");

    for (const table of ["sales", "sale_items", "payments", "cash_sessions", "cash_movements", "stock_movements", "financial_settlements", "purchase_orders", "inventory_counts", "player_credit_movements"]) expect(await count(table)).toBe(0);
    expect(await count("products")).toBe(0);
    expect(await count("supplier_product_mappings")).toBe(0);
    expect(existsSync(path.join(storage, imageKey))).toBe(false);
    expect(output).toContain("1 foto(s) de produto removida(s)");
    expect((await pool.query("SELECT credit_balance_cents FROM players")).rows[0].credit_balance_cents).toBe(0);
    expect((await pool.query("SELECT count(*)::int total FROM financial_installments WHERE settled_cents<>0 OR status<>'OPEN'")).rows[0].total).toBe(0);
    expect((await pool.query("SELECT status FROM financial_accounts")).rows.every((row) => row.status === "OPEN")).toBe(true);
    expect((await pool.query("SELECT settlement_id,reconciled_at FROM bank_transactions")).rows[0]).toEqual({ settlement_id: null, reconciled_at: null });
    expect((await pool.query("SELECT product_id,stock_imported_at,stock_unit_cost_cents FROM fiscal_invoice_items")).rows[0]).toEqual({ product_id: null, stock_imported_at: null, stock_unit_cost_cents: null });

    // preservados
    expect(await count("fiscal_invoices")).toBe(1);
    expect(await count("categories")).toBeGreaterThan(0);
    expect(await count("users")).toBe(2);
    expect(await count("players")).toBe(1);
    expect(await count("suppliers")).toBe(1);
    expect(await count("cash_registers")).toBe(1);
    expect(await count("payment_methods")).toBe(4);
    expect((await pool.query("SELECT count(*)::int total FROM audit_logs WHERE action='SYSTEM_REOPEN_INVOICES_FOR_ENTRY'")).rows[0].total).toBe(1);

    // a nota volta a poder dar entrada, recriando o produto (inativo, sem foto), e a numeração das vendas recomeça
    const invoiceId = (await pool.query<{ id: string }>("SELECT id FROM fiscal_invoices LIMIT 1")).rows[0].id;
    expect(await receiveFiscalInvoiceStock(invoiceId, adminId)).toEqual({ entered: 1, alreadyEntered: 0, errors: 0 });
    expect(await count("products")).toBe(1);
    expect(await count("supplier_product_mappings")).toBe(1);
    expect((await pool.query("SELECT stock_quantity,active,image_key FROM products")).rows[0]).toEqual({ stock_quantity: 2, active: false, image_key: null });
    await pool.query("UPDATE products SET active=true");
    const register = (await pool.query<{ id: string }>("SELECT id FROM cash_registers LIMIT 1")).rows[0].id;
    await pool.query("INSERT INTO cash_sessions(register_id,operator_id,opening_amount_cents) VALUES ($1,$2,0)", [register, operatorId]);
    const product = (await pool.query<{ id: string; sale_price_cents: number }>("SELECT id,sale_price_cents FROM products LIMIT 1")).rows[0];
    const sale = await createSale({ items: [{ productId: product.id, quantity: 1, discountBasisPoints: 0 }], payments: [{ methodCode: "PIX", amountAppliedCents: product.sale_price_cents }] }, operatorId);
    expect(sale.id).toBe(1);
  });
});
