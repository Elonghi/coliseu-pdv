import pg from "pg";
import path from "node:path";
import { unlink } from "node:fs/promises";

const confirmation = "ZERAR_DADOS_OPERACIONAIS";
if (process.env.CONFIRM_PRODUCTION_RESET !== confirmation) {
  console.error(`Operação cancelada. Defina CONFIRM_PRODUCTION_RESET=${confirmation} para confirmar.`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não está configurada.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
let productImageKeys = [];

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '30s'");
  await client.query(`LOCK TABLE players,products,product_splits,supplier_product_mappings,sales,sale_items,payments,
    cash_movements,cash_sessions,inventory_count_items,inventory_counts,purchase_order_items,purchase_orders,
    player_credit_movements,stock_movements,bank_transactions,bank_imports,financial_settlements,financial_installments,financial_accounts,
    fiscal_invoice_events,fiscal_invoice_items,fiscal_invoices,fiscal_dfe_documents,fiscal_import_batches
    IN ACCESS EXCLUSIVE MODE`);

  const before = (await client.query(`SELECT
    (SELECT count(*)::int FROM products) products,
    (SELECT COALESCE(sum(stock_quantity),0)::bigint FROM products) total_stock,
    (SELECT count(*)::int FROM stock_movements) stock_movements,
    (SELECT count(*)::int FROM sales) sales,
    (SELECT count(*)::int FROM payments) payments,
    (SELECT count(*)::int FROM financial_accounts) financial_accounts,
    (SELECT count(*)::int FROM player_credit_movements) player_credit_movements,
    (SELECT count(*)::int FROM fiscal_invoices) fiscal_invoices,
    (SELECT count(*)::int FROM fiscal_dfe_documents) fiscal_documents`)).rows[0];
  productImageKeys = (await client.query("SELECT image_key FROM products WHERE image_key IS NOT NULL"))
    .rows.map((row) => row.image_key);

  await client.query("DELETE FROM bank_transactions");
  await client.query("DELETE FROM bank_imports");
  await client.query("DELETE FROM financial_settlements");
  await client.query("DELETE FROM player_credit_movements");
  await client.query("DELETE FROM financial_installments");
  await client.query("DELETE FROM financial_accounts");
  await client.query("UPDATE players SET credit_balance_cents=0,updated_at=now() WHERE credit_balance_cents<>0");
  await client.query("DELETE FROM payments");
  await client.query("DELETE FROM stock_movements");
  await client.query("DELETE FROM product_splits");
  await client.query("DELETE FROM sale_items");
  await client.query("DELETE FROM sales");
  await client.query("ALTER TABLE sales ALTER COLUMN id RESTART WITH 1");
  await client.query("DELETE FROM cash_movements");
  await client.query("DELETE FROM cash_sessions");
  await client.query("DELETE FROM inventory_count_items");
  await client.query("DELETE FROM inventory_counts");
  await client.query("DELETE FROM purchase_order_items");
  await client.query("DELETE FROM purchase_orders");
  await client.query("DELETE FROM fiscal_invoice_events");
  await client.query("DELETE FROM fiscal_invoice_items");
  await client.query("DELETE FROM fiscal_invoices");
  await client.query("DELETE FROM fiscal_dfe_documents");
  await client.query("DELETE FROM fiscal_import_batches");
  await client.query("DELETE FROM supplier_product_mappings");
  await client.query("DELETE FROM products");
  await client.query("UPDATE sefaz_sync_states SET last_error=NULL,updated_at=now()");

  await client.query("COMMIT");

  const storageRoot = path.resolve(process.env.STORAGE_PATH || path.join(process.cwd(), "storage"));
  let removedImages = 0;
  for (const imageKey of productImageKeys) {
    const imagePath = path.resolve(storageRoot, imageKey);
    if (!imagePath.startsWith(`${storageRoot}${path.sep}`)) continue;
    try {
      await unlink(imagePath);
      removedImages += 1;
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`Não foi possível remover a foto ${imageKey}.`);
    }
  }

  console.log("Limpeza concluída com sucesso.");
  console.table(before);
  console.log(`${removedImages} foto(s) de produto removida(s) do storage.`);
  console.log("Usuários, configurações, categorias, unidades, formas de pagamento, jogadores, fornecedores, caixas, auditoria e último NSU foram preservados.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("A limpeza falhou e nenhuma alteração foi confirmada.", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
