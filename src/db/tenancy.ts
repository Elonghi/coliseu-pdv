/* Classificação de cada tabela para o isolamento por conta e por loja (ver docs/PLANO_MULTI_LOJA.md, seção 3).
 *   ACCOUNT    pertence à conta do proprietário (usuários, permissões, sessões, auditoria).
 *   SHAREABLE  é da conta; o proprietário decide se um item é compartilhado entre as lojas (loja vazia) ou de uma loja.
 *   STORE      sempre de uma única loja.
 *   GLOBAL     dado de referência comum a todas as contas.
 * Toda tabela nova do schema precisa entrar aqui: o teste tests/tenancy-manifest.test.ts falha se faltar alguma. */
export type TenancyLevel = "ACCOUNT" | "SHAREABLE" | "STORE" | "GLOBAL";

export const tenancy = {
  users: "ACCOUNT",
  sessions: "ACCOUNT",
  user_permissions: "ACCOUNT",
  audit_logs: "ACCOUNT",

  categories: "SHAREABLE",
  products: "SHAREABLE",
  supplier_product_mappings: "SHAREABLE",
  suppliers: "SHAREABLE",
  players: "SHAREABLE",

  units: "GLOBAL",

  cash_registers: "STORE",
  cash_sessions: "STORE",
  cash_movements: "STORE",
  sales: "STORE",
  sale_items: "STORE",
  payment_methods: "STORE",
  payments: "STORE",
  product_splits: "STORE",
  stock_movements: "STORE",
  inventory_counts: "STORE",
  inventory_count_items: "STORE",
  purchase_orders: "STORE",
  purchase_order_items: "STORE",
  player_credit_movements: "STORE",
  financial_accounts: "STORE",
  financial_installments: "STORE",
  financial_settlements: "STORE",
  bank_imports: "STORE",
  bank_transactions: "STORE",
  sefaz_sync_states: "STORE",
  fiscal_import_batches: "STORE",
  fiscal_dfe_documents: "STORE",
  fiscal_invoices: "STORE",
  fiscal_invoice_items: "STORE",
  fiscal_invoice_events: "STORE",
  // Integração SAE NFC-e (migração 0014, em andamento).
  sae_nfce_sync_states: "STORE",
  sae_nfce_keys: "STORE",
} as const satisfies Record<string, TenancyLevel>;
