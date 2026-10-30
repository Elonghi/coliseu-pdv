/* Deixa o sistema "cru" para recomeçar a entrada de estoque pelas notas fiscais.
 *
 * O que é APAGADO: produtos (com preço, foto e vínculos com fornecedor), vendas, pagamentos, caixas (sessões e
 * movimentos), movimentações de estoque, aberturas de box, inventários, pedidos de compra, liquidações (baixas) e
 * conciliações bancárias, créditos e dívidas de jogadores, contas a receber e quaisquer contas que não venham de nota fiscal.
 * O que é REABERTO: cada item de nota fiscal volta a "aguardando entrada" (sem produto); as duplicatas das notas voltam
 * a "aberta", sem nada pago. Ao dar entrada, cada produto é recriado a partir da nota (inativo, preço = custo, sem foto).
 * O que é PRESERVADO: notas fiscais e seus XMLs, usuários e permissões, categorias, unidades, formas de pagamento,
 * cadastro de caixas, fornecedores, jogadores (somente o saldo zera), extratos bancários importados, auditoria e o
 * último NSU da SEFAZ.
 *
 * Uso:
 *   node scripts/reset-to-invoice-entry.mjs                       # simulação: executa tudo e desfaz, só mostra os números
 *   CONFIRM_REOPEN_INVOICES=REABRIR_NOTAS_PARA_ENTRADA \
 *     node scripts/reset-to-invoice-entry.mjs --apply --db=NOME   # grava de verdade (NOME = banco mostrado na simulação)
 *
 * É irreversível depois do --apply. Faça um backup antes (scripts/backup.sh). */
import pg from "pg";
import path from "node:path";
import { unlink } from "node:fs/promises";

const CONFIRMATION = "REABRIR_NOTAS_PARA_ENTRADA";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const typedDatabase = args.find((arg) => arg.startsWith("--db="))?.slice("--db=".length);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não está configurada.");
  process.exit(1);
}
const target = new URL(process.env.DATABASE_URL);
const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));
console.log(`Banco: ${target.hostname}:${target.port || 5432}/${databaseName}`);

if (apply) {
  if (process.env.CONFIRM_REOPEN_INVOICES !== CONFIRMATION) {
    console.error(`Operação cancelada. Defina CONFIRM_REOPEN_INVOICES=${CONFIRMATION} para confirmar.`);
    process.exit(1);
  }
  if (typedDatabase !== databaseName) {
    console.error(`Operação cancelada. Para confirmar o banco, passe --db=${databaseName}.`);
    process.exit(1);
  }
}
console.log(apply ? "MODO: APLICAR (as alterações serão gravadas)\n" : "MODO: SIMULAÇÃO (nada será gravado; rode com --apply para valer)\n");

const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
const steps = [];
const exists = async (table) => (await client.query("SELECT to_regclass($1) IS NOT NULL AS ok", [`public.${table}`])).rows[0].ok;
const step = async (label, sql) => { const result = await client.query(sql); steps.push({ Etapa: label, Registros: result.rowCount ?? 0 }); };

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '30s'");
  const tables = ["players", "products", "product_splits", "sales", "sale_items", "payments", "cash_movements", "cash_sessions",
    "inventory_count_items", "inventory_counts", "purchase_order_items", "purchase_orders", "player_credit_movements", "stock_movements", "supplier_product_mappings",
    "bank_transactions", "financial_settlements", "financial_installments", "financial_accounts", "fiscal_invoices", "fiscal_invoice_items", "audit_logs"];
  const present = [];
  for (const table of tables) if (await exists(table)) present.push(table);
  await client.query(`LOCK TABLE ${present.join(",")} IN ACCESS EXCLUSIVE MODE`);

  const before = (await client.query(`SELECT
    (SELECT count(*)::int FROM products) produtos,
    (SELECT count(*)::int FROM products WHERE image_key IS NOT NULL) produtos_com_foto,
    (SELECT count(*)::int FROM supplier_product_mappings) vinculos_fornecedor_produto,
    (SELECT count(*)::int FROM products WHERE stock_quantity<>0) produtos_com_estoque,
    (SELECT COALESCE(sum(stock_quantity),0)::bigint FROM products) unidades_em_estoque,
    (SELECT count(*)::int FROM stock_movements) movimentacoes_de_estoque,
    (SELECT count(*)::int FROM sales) vendas,
    (SELECT count(*)::int FROM cash_sessions) sessoes_de_caixa,
    (SELECT count(*)::int FROM financial_settlements) liquidacoes,
    (SELECT COALESCE(sum(amount_cents) FILTER (WHERE reversed_at IS NULL),0)::bigint FROM financial_settlements) valor_liquidado_cents,
    (SELECT COALESCE(sum(credit_balance_cents) FILTER (WHERE credit_balance_cents>0),0)::bigint FROM players) credito_de_jogadores_cents,
    (SELECT COALESCE(sum(credit_balance_cents) FILTER (WHERE credit_balance_cents<0),0)::bigint FROM players) divida_de_jogadores_cents,
    (SELECT count(*)::int FROM purchase_orders) pedidos_de_compra,
    (SELECT count(*)::int FROM inventory_counts) inventarios,
    (SELECT count(*)::int FROM fiscal_invoices) notas_fiscais,
    (SELECT count(*)::int FROM fiscal_invoice_items WHERE stock_imported_at IS NOT NULL) itens_de_nota_com_entrada`)).rows[0];

  const imageKeys = (await client.query("SELECT image_key FROM products WHERE image_key IS NOT NULL")).rows.map((row) => row.image_key);

  await step("Conciliações bancárias desfeitas", "UPDATE bank_transactions SET settlement_id=NULL,reconciled_at=NULL,reconciled_by_id=NULL WHERE settlement_id IS NOT NULL OR reconciled_at IS NOT NULL");
  await step("Créditos e dívidas de jogadores (movimentos)", "DELETE FROM player_credit_movements");
  await step("Liquidações apagadas", "DELETE FROM financial_settlements");
  await step("Parcelas que não vêm de nota fiscal", "DELETE FROM financial_installments WHERE account_id IN (SELECT id FROM financial_accounts WHERE fiscal_invoice_id IS NULL)");
  await step("Contas que não vêm de nota fiscal", "DELETE FROM financial_accounts WHERE fiscal_invoice_id IS NULL");
  await step("Duplicatas de notas reabertas", "UPDATE financial_installments SET settled_cents=0,status='OPEN',updated_at=now() WHERE status<>'CANCELED' AND (status<>'OPEN' OR settled_cents<>0)");
  await step("Contas de notas reabertas", "UPDATE financial_accounts SET status='OPEN',updated_at=now() WHERE status IN ('PARTIAL','SETTLED')");
  await step("Pagamentos de vendas", "DELETE FROM payments");
  await step("Movimentações de estoque", "DELETE FROM stock_movements");
  await step("Aberturas de box", "DELETE FROM product_splits");
  await step("Itens de venda", "DELETE FROM sale_items");
  await step("Vendas", "DELETE FROM sales");
  await client.query("ALTER TABLE sales ALTER COLUMN id RESTART WITH 1");
  await step("Movimentos de caixa", "DELETE FROM cash_movements");
  await step("Sessões de caixa", "DELETE FROM cash_sessions");
  await step("Itens de inventário", "DELETE FROM inventory_count_items");
  await step("Inventários", "DELETE FROM inventory_counts");
  await step("Itens de pedido de compra", "DELETE FROM purchase_order_items");
  await step("Pedidos de compra", "DELETE FROM purchase_orders");
  await client.query("ALTER TABLE purchase_orders ALTER COLUMN number RESTART WITH 1");
  await step("Itens de nota aguardando entrada", `UPDATE fiscal_invoice_items SET product_id=NULL,stock_unit_cost_cents=NULL,stock_imported_at=NULL,stock_reversed_at=NULL,stock_import_error=NULL
    WHERE product_id IS NOT NULL OR stock_unit_cost_cents IS NOT NULL OR stock_imported_at IS NOT NULL OR stock_reversed_at IS NOT NULL OR stock_import_error IS NOT NULL`);
  await step("Vínculos fornecedor-produto", "DELETE FROM supplier_product_mappings");
  await step("Produtos (e o estoque deles)", "DELETE FROM products");
  await step("Saldos de jogadores zerados", "UPDATE players SET credit_balance_cents=0,updated_at=now() WHERE credit_balance_cents<>0");

  const after = (await client.query(`SELECT
    (SELECT count(*)::int FROM fiscal_invoices f JOIN sefaz_sync_states s ON s.id=f.sync_state_id
      WHERE f.status='AUTHORIZED' AND f.has_full_xml AND regexp_replace(COALESCE(f.recipient_cnpj_cpf,''),'\\D','','g')=regexp_replace(s.company_cnpj,'\\D','','g')
        AND EXISTS (SELECT 1 FROM fiscal_invoice_items i WHERE i.invoice_id=f.id)) notas_prontas_para_entrada,
    (SELECT count(*)::int FROM fiscal_invoice_items WHERE stock_imported_at IS NULL) itens_aguardando_entrada,
    (SELECT count(*)::int FROM products) produtos,
    (SELECT COALESCE(sum(stock_quantity),0)::bigint FROM products) unidades_em_estoque`)).rows[0];

  if (apply) {
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES (NULL,'SYSTEM_REOPEN_INVOICES_FOR_ENTRY','system','reset-to-invoice-entry',$1)", [JSON.stringify({ before, after })]);
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }

  console.log("O que será (ou foi) feito:");
  console.table(steps);
  console.log("\nAntes:");
  console.table({
    "Produtos": before.produtos,
    "Produtos com foto": before.produtos_com_foto,
    "Vínculos fornecedor-produto": before.vinculos_fornecedor_produto,
    "Produtos com estoque": before.produtos_com_estoque,
    "Unidades em estoque": Number(before.unidades_em_estoque),
    "Vendas": before.vendas,
    "Sessões de caixa": before.sessoes_de_caixa,
    "Liquidações": before.liquidacoes,
    "Valor liquidado": money(before.valor_liquidado_cents),
    "Crédito de jogadores a zerar": money(before.credito_de_jogadores_cents),
    "Dívida de jogadores a zerar": money(before.divida_de_jogadores_cents),
    "Pedidos de compra": before.pedidos_de_compra,
    "Inventários": before.inventarios,
    "Notas fiscais": before.notas_fiscais,
    "Itens de nota com entrada feita": before.itens_de_nota_com_entrada,
  });
  console.log("\nDepois:");
  console.table({
    "Produtos": after.produtos,
    "Unidades em estoque": Number(after.unidades_em_estoque),
    "Itens de nota aguardando entrada": after.itens_aguardando_entrada,
    "Notas prontas para dar entrada": after.notas_prontas_para_entrada,
  });
  if (before.credito_de_jogadores_cents > 0 || before.divida_de_jogadores_cents < 0) {
    console.warn("\nATENÇÃO: os saldos de crédito e dívida dos jogadores serão zerados. Confirme que isso é o desejado.");
  }
  if (before.produtos > 0) {
    console.warn(`ATENÇÃO: ${before.produtos} produto(s) serão apagados, com preço, categoria, observações e ${before.produtos_com_foto} foto(s). Ao dar entrada, voltam da nota como inativos, com preço igual ao custo e sem foto.`);
  }

  // As fotos ficam em disco (STORAGE_PATH); só saem depois que o banco confirmou, e uma falha aqui não desfaz nada.
  let removedImages = 0;
  if (apply) {
    const storageRoot = path.resolve(process.env.STORAGE_PATH || path.join(process.cwd(), "storage"));
    for (const imageKey of imageKeys) {
      const imagePath = path.resolve(storageRoot, imageKey);
      if (!imagePath.startsWith(`${storageRoot}${path.sep}`)) continue;
      try {
        await unlink(imagePath);
        removedImages += 1;
      } catch (error) {
        if (error?.code !== "ENOENT") console.warn(`Não foi possível remover a foto ${imageKey}.`);
      }
    }
    console.log(`${removedImages} foto(s) de produto removida(s) do armazenamento.`);
  }
  console.log(apply
    ? "\nConcluído e gravado. Usuários, notas fiscais, fornecedores, categorias, jogadores (sem saldo) e auditoria foram preservados."
    : "\nSimulação concluída: NADA foi gravado. Para aplicar, rode com --apply --db=" + databaseName + " e CONFIRM_REOPEN_INVOICES=" + CONFIRMATION + ".");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("A operação falhou e nenhuma alteração foi gravada.", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
