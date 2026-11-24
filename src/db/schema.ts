import { sql } from "drizzle-orm";
import { bigint, boolean, check, customType, date, doublePrecision, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "OPERATOR"]);
export const saleStatus = pgEnum("sale_status", ["CONFIRMED", "CANCELED"]);
export const stockMovementType = pgEnum("stock_movement_type", ["INITIAL", "MANUAL_IN", "MANUAL_ADJUSTMENT", "SALE", "SALE_CANCELLATION", "RETURN", "FISCAL_ENTRY", "FISCAL_CANCELLATION", "BOX_SPLIT_OUT", "BOOSTER_SPLIT_IN", "INVENTORY_COUNT", "PURCHASE_RECEIPT"]);
export const financialAccountType = pgEnum("financial_account_type", ["PAYABLE", "RECEIVABLE"]);
export const financialStatus = pgEnum("financial_status", ["OPEN", "PARTIAL", "SETTLED", "CANCELED"]);
export const playerCreditMovementType = pgEnum("player_credit_movement_type", ["MANUAL", "SALE_CREDIT", "FUTURE_CHARGE", "FUTURE_PAYMENT", "SALE_REVERSAL"]);
export const sefazEnvironment = pgEnum("sefaz_environment", ["PRODUCTION", "HOMOLOGATION"]);
export const fiscalDocumentKind = pgEnum("fiscal_document_kind", ["SUMMARY", "NFE", "EVENT", "UNKNOWN"]);
export const fiscalInvoiceStatus = pgEnum("fiscal_invoice_status", ["AUTHORIZED", "CANCELED", "DENIED", "UNKNOWN"]);
export const cashSessionStatus = pgEnum("cash_session_status", ["OPEN", "CLOSED"]);
export const cashMovementType = pgEnum("cash_movement_type", ["SUPPLY", "WITHDRAWAL"]);
export const inventoryCountStatus = pgEnum("inventory_count_status", ["OPEN", "FINALIZED", "CANCELED"]);
export const purchaseOrderStatus = pgEnum("purchase_order_status", ["DRAFT", "SENT", "PARTIAL", "RECEIVED", "CANCELED"]);
export const printJobStatus = pgEnum("print_job_status", ["QUEUED", "SENT", "PRINTED", "FAILED"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  active: boolean("active").default(true).notNull(),
  maxStores: integer("max_stores"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [check("accounts_max_stores_valid", sql`${t.maxStores} IS NULL OR ${t.maxStores} >= 1`)]);

export const stores = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 160 }).notNull(),
  cnpj: varchar("cnpj", { length: 14 }),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("stores_account_name_lower_uidx").on(t.accountId, sql`lower(${t.name})`),
  index("stores_account_idx").on(t.accountId),
  check("stores_cnpj_format", sql`${t.cnpj} IS NULL OR ${t.cnpj} ~ '^[A-Z0-9]{14}$'`),
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  active: boolean("active").default(true).notNull(),
  interfaceMode: varchar("interface_mode", { length: 12 }).default("LEGACY").notNull(),
  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpEnabled: boolean("totp_enabled").default(false).notNull(),
  isPlatformAdmin: boolean("is_platform_admin").default(false).notNull(),
  accountId: uuid("account_id").default(sql`app_current_account()`).references(() => accounts.id, { onDelete: "restrict" }),
  isAccountOwner: boolean("is_account_owner").default(false).notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("users_email_lower_uidx").on(sql`lower(${t.email})`),
  index("users_role_active_idx").on(t.role, t.active),
  index("users_account_idx").on(t.accountId),
  check("users_interface_mode_valid", sql`${t.interfaceMode} IN ('LEGACY', 'MODERN')`),
  check("users_account_required", sql`${t.accountId} IS NOT NULL OR ${t.isPlatformAdmin}`),
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]);

export const categories = pgTable("categories", {
  accountId: uuid("account_id").notNull().default(sql`app_current_account()`).references(() => accounts.id, { onDelete: "restrict" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(), name: varchar("name", { length: 100 }).notNull(), active: boolean("active").default(true).notNull(), ...timestamps,
}, (t) => [index("categories_account_idx").on(t.accountId), uniqueIndex("categories_account_name_lower_uidx").on(t.accountId, sql`lower(${t.name})`), index("categories_active_idx").on(t.active)]);

export const units = pgTable("units", {
  id: uuid("id").defaultRandom().primaryKey(), code: varchar("code", { length: 12 }).notNull().unique(), name: varchar("name", { length: 50 }).notNull(), active: boolean("active").default(true).notNull(), ...timestamps,
});

export const userPermissions = pgTable("user_permissions", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 60 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("user_permissions_user_permission_uidx").on(t.userId, t.permission), index("user_permissions_user_idx").on(t.userId)]);

export const userStores = pgTable("user_stores", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("user_stores_user_store_uidx").on(t.userId, t.storeId), index("user_stores_store_idx").on(t.storeId)]);

export const products = pgTable("products", {
  accountId: uuid("account_id").notNull().default(sql`app_current_account()`).references(() => accounts.id, { onDelete: "restrict" }),
  // Dono do produto: a loja ativa na criação. Vazio = compartilhado entre as lojas do lojista (só produtos que já existiam em mais de uma loja).
  storeId: uuid("store_id").default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  sku: varchar("sku", { length: 60 }).notNull(),
  barcode: varchar("barcode", { length: 64 }),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"), imageKey: text("image_key"),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "restrict" }),
  costCents: integer("cost_cents").notNull(), salePriceCents: integer("sale_price_cents").notNull(),
  maxDiscountBps: integer("max_discount_bps").default(0).notNull(),
  stockQuantity: integer("stock_quantity").default(0).notNull(), minimumStock: integer("minimum_stock").default(0).notNull(),
  canSplitIntoBoosters: boolean("can_split_into_boosters").default(false).notNull(),
  isLooseBooster: boolean("is_loose_booster").default(false).notNull(),
  tcgGame: varchar("tcg_game", { length: 80 }),
  tcgSetName: varchar("tcg_set_name", { length: 120 }),
  tcgCollectorNumber: varchar("tcg_collector_number", { length: 40 }),
  tcgLanguage: varchar("tcg_language", { length: 40 }),
  tcgRarity: varchar("tcg_rarity", { length: 80 }),
  tcgCondition: varchar("tcg_condition", { length: 40 }),
  /** O cliente pode pedir este produto pelo celular, na comanda. Desligado por padrão: o lojista escolhe o que entra no cardápio. */
  availableOnComanda: boolean("available_on_comanda").default(false).notNull(),
  active: boolean("active").default(true).notNull(), ...timestamps,
}, (t) => [uniqueIndex("products_scope_sku_uidx").on(t.accountId, sql`coalesce(${t.storeId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.sku), uniqueIndex("products_scope_barcode_uidx").on(t.accountId, sql`coalesce(${t.storeId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.barcode), index("products_account_idx").on(t.accountId), 
  check("products_money_nonnegative", sql`${t.costCents} >= 0 AND ${t.salePriceCents} >= 0`),
  check("products_discount_valid", sql`${t.maxDiscountBps} BETWEEN 0 AND 10000`),
  check("products_stock_nonnegative", sql`${t.stockQuantity} >= 0 AND ${t.minimumStock} >= 0`),
  index("products_name_idx").on(t.name), index("products_active_idx").on(t.active), index("products_category_idx").on(t.categoryId),
]);

/* Saldo e custo médio de cada produto em cada loja. O produto (catálogo) pode ser compartilhado entre as lojas do lojista;
 * o estoque nunca é. products.stock_quantity continua existindo como total, mantido por gatilho (ver migration 0016). */
export const productStock = pgTable("product_stock", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  quantity: integer("quantity").default(0).notNull(),
  costCents: integer("cost_cents").default(0).notNull(),
  ...timestamps,
}, (t) => [
  primaryKey({ columns: [t.storeId, t.productId] }),
  index("product_stock_product_idx").on(t.productId),
  check("product_stock_values_valid", sql`${t.quantity} >= 0 AND ${t.costCents} >= 0`),
]);

export const supplierProductMappings = pgTable("supplier_product_mappings", {
  accountId: uuid("account_id").notNull().default(sql`app_current_account()`).references(() => accounts.id, { onDelete: "restrict" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  supplierDocument: varchar("supplier_document", { length: 14 }).notNull(),
  supplierProductCode: varchar("supplier_product_code", { length: 180 }).notNull(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  ...timestamps,
}, (t) => [index("supplier_product_mappings_account_idx").on(t.accountId), 
  uniqueIndex("supplier_product_mappings_scope_supplier_code_uidx").on(t.accountId, sql`coalesce(${t.storeId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.supplierDocument, t.supplierProductCode),
  index("supplier_product_mappings_product_idx").on(t.productId),
]);

export const players = pgTable("players", {
  accountId: uuid("account_id").notNull().default(sql`app_current_account()`).references(() => accounts.id, { onDelete: "restrict" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 40 }),
  notes: text("notes"),
  creditBalanceCents: integer("credit_balance_cents").default(0).notNull(),
  /** Criado às pressas ao abrir uma comanda (só o nome): o atendente completa o cadastro ao fechar a conta. */
  provisional: boolean("provisional").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (t) => [index("players_account_idx").on(t.accountId), index("players_name_idx").on(t.name), index("players_active_idx").on(t.active), index("players_email_idx").on(t.email)]);

export const productSplits = pgTable("product_splits", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  sourceProductId: uuid("source_product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  outputProductId: uuid("output_product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  sourceQuantity: integer("source_quantity").default(1).notNull(),
  outputQuantity: integer("output_quantity").notNull(),
  sourceUnitCostCents: integer("source_unit_cost_cents").notNull(),
  outputUnitCostCents: integer("output_unit_cost_cents").notNull(),
  outputSalePriceCents: integer("output_sale_price_cents").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("product_splits_store_idx").on(t.storeId), 
  check("product_splits_values_valid", sql`${t.sourceQuantity} > 0 AND ${t.outputQuantity} > 1 AND ${t.sourceUnitCostCents} >= 0 AND ${t.outputUnitCostCents} >= 0 AND ${t.outputSalePriceCents} > 0`),
  index("product_splits_source_date_idx").on(t.sourceProductId, t.createdAt),
  index("product_splits_output_date_idx").on(t.outputProductId, t.createdAt),
]);

export const cashRegisters = pgTable("cash_registers", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (t) => [index("cash_registers_store_idx").on(t.storeId), uniqueIndex("cash_registers_store_name_lower_uidx").on(t.storeId, sql`lower(${t.name})`), index("cash_registers_active_idx").on(t.active)]);

export const cashSessions = pgTable("cash_sessions", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  registerId: uuid("register_id").notNull().references(() => cashRegisters.id, { onDelete: "restrict" }),
  operatorId: uuid("operator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: cashSessionStatus("status").default("OPEN").notNull(),
  openingAmountCents: integer("opening_amount_cents").default(0).notNull(),
  closingCountedCents: integer("closing_counted_cents"),
  expectedAmountCents: integer("expected_amount_cents"),
  differenceCents: integer("difference_cents"),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedById: uuid("closed_by_id").references(() => users.id, { onDelete: "restrict" }),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("cash_sessions_store_idx").on(t.storeId), check("cash_sessions_amounts_valid", sql`${t.openingAmountCents} >= 0 AND (${t.closingCountedCents} IS NULL OR ${t.closingCountedCents} >= 0)`), index("cash_sessions_register_status_idx").on(t.registerId, t.status), index("cash_sessions_operator_status_idx").on(t.operatorId, t.status), uniqueIndex("cash_sessions_one_open_register_uidx").on(t.registerId).where(sql`${t.status} = 'OPEN'`), uniqueIndex("cash_sessions_one_open_operator_uidx").on(t.operatorId).where(sql`${t.status} = 'OPEN'`)]);

export const cashMovements = pgTable("cash_movements", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => cashSessions.id, { onDelete: "restrict" }),
  type: cashMovementType("type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  reason: varchar("reason", { length: 300 }).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("cash_movements_store_idx").on(t.storeId), check("cash_movements_amount_positive", sql`${t.amountCents} > 0`), index("cash_movements_session_date_idx").on(t.sessionId, t.createdAt)]);

export const sales = pgTable("sales", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  operatorId: uuid("operator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, { onDelete: "restrict" }),
  status: saleStatus("status").default("CONFIRMED").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(), discountCents: integer("discount_cents").notNull(), totalCents: integer("total_cents").notNull(),
  canceledById: uuid("canceled_by_id").references(() => users.id, { onDelete: "restrict" }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }), cancellationReason: text("cancellation_reason"),
  /** Abertura de comanda que esta venda fechou (uma venda por abertura). */
  comandaSessionId: uuid("comanda_session_id").references((): AnyPgColumn => comandaSessions.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("sales_comanda_session_uidx").on(t.comandaSessionId).where(sql`${t.comandaSessionId} IS NOT NULL`), index("sales_store_idx").on(t.storeId), index("sales_created_idx").on(t.createdAt), index("sales_operator_idx").on(t.operatorId), index("sales_cash_session_idx").on(t.cashSessionId), index("sales_status_idx").on(t.status)]);

export const saleItems = pgTable("sale_items", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(), saleId: integer("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  productName: varchar("product_name", { length: 180 }).notNull(), sku: varchar("sku", { length: 60 }).notNull(), unitCode: varchar("unit_code", { length: 12 }).notNull(),
  quantity: integer("quantity").notNull(), unitPriceCents: integer("unit_price_cents").notNull(), unitCostCents: integer("unit_cost_cents").notNull(),
  discountBps: integer("discount_bps").notNull(), grossCents: integer("gross_cents").notNull(), discountCents: integer("discount_cents").notNull(), totalCents: integer("total_cents").notNull(),
}, (t) => [index("sale_items_store_idx").on(t.storeId), check("sale_items_quantity_positive", sql`${t.quantity} > 0`), index("sale_items_sale_idx").on(t.saleId), index("sale_items_product_idx").on(t.productId)]);

export const paymentMethods = pgTable("payment_methods", {
  code: varchar("code", { length: 30 }).primaryKey(), name: varchar("name", { length: 80 }).notNull(), active: boolean("active").default(true).notNull(), sortOrder: integer("sort_order").default(0).notNull(), ...timestamps,
});

/* Quais formas de pagamento cada loja usa. O catálogo de códigos (payment_methods) é global porque o sistema interpreta
 * cada código (dinheiro, PIX, crédito do jogador, pagamento futuro); o que muda por loja é estar ativa ou não. */
export const storePaymentMethods = pgTable("store_payment_methods", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 30 }).notNull().references(() => paymentMethods.code, { onDelete: "cascade" }),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (t) => [primaryKey({ columns: [t.storeId, t.code] })]);

export const payments = pgTable("payments", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(), saleId: integer("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }),
  methodCode: varchar("method_code", { length: 30 }).notNull().references(() => paymentMethods.code, { onDelete: "restrict" }),
  playerId: uuid("player_id").references(() => players.id, { onDelete: "restrict" }),
  dueDate: date("due_date"),
  amountAppliedCents: integer("amount_applied_cents").notNull(), amountReceivedCents: integer("amount_received_cents"), changeCents: integer("change_cents").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("payments_store_idx").on(t.storeId), check("payments_amount_positive", sql`${t.amountAppliedCents} > 0 AND ${t.changeCents} >= 0`), uniqueIndex("payments_sale_method_uidx").on(t.saleId, t.methodCode), index("payments_method_idx").on(t.methodCode), index("payments_player_idx").on(t.playerId)]);

export const financialAccounts = pgTable("financial_accounts", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  type: financialAccountType("type").notNull(),
  description: varchar("description", { length: 220 }).notNull(),
  counterpartyName: varchar("counterparty_name", { length: 180 }).notNull(),
  playerId: uuid("player_id").references(() => players.id, { onDelete: "restrict" }),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "restrict" }),
  fiscalInvoiceId: uuid("fiscal_invoice_id").references((): AnyPgColumn => fiscalInvoices.id, { onDelete: "restrict" }),
  issueDate: date("issue_date").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: financialStatus("status").default("OPEN").notNull(),
  notes: text("notes"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (t) => [index("financial_accounts_store_idx").on(t.storeId), check("financial_accounts_total_positive", sql`${t.totalCents} > 0`), index("financial_accounts_type_status_idx").on(t.type, t.status), index("financial_accounts_sale_idx").on(t.saleId), index("financial_accounts_player_idx").on(t.playerId), uniqueIndex("financial_accounts_fiscal_invoice_uidx").on(t.fiscalInvoiceId), index("financial_accounts_created_idx").on(t.createdAt)]);

export const financialInstallments = pgTable("financial_installments", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => financialAccounts.id, { onDelete: "restrict" }),
  installmentNumber: integer("installment_number").notNull(),
  sourceReference: varchar("source_reference", { length: 60 }),
  dueDate: date("due_date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  settledCents: integer("settled_cents").default(0).notNull(),
  status: financialStatus("status").default("OPEN").notNull(),
  ...timestamps,
}, (t) => [index("financial_installments_store_idx").on(t.storeId), check("financial_installments_values_valid", sql`${t.installmentNumber} > 0 AND ${t.amountCents} > 0 AND ${t.settledCents} >= 0 AND ${t.settledCents} <= ${t.amountCents}`), uniqueIndex("financial_installments_account_number_uidx").on(t.accountId, t.installmentNumber), index("financial_installments_due_status_idx").on(t.dueDate, t.status)]);

export const financialSettlements = pgTable("financial_settlements", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  installmentId: uuid("installment_id").notNull().references(() => financialInstallments.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  methodCode: varchar("method_code", { length: 30 }).notNull().references(() => paymentMethods.code, { onDelete: "restrict" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  personName: varchar("person_name", { length: 180 }),
  notes: text("notes"),
  createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  reversedById: uuid("reversed_by_id").references(() => users.id, { onDelete: "restrict" }),
  reversalReason: text("reversal_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("financial_settlements_store_idx").on(t.storeId), check("financial_settlements_amount_positive", sql`${t.amountCents} > 0`), index("financial_settlements_installment_idx").on(t.installmentId), index("financial_settlements_occurred_idx").on(t.occurredAt)]);

export const bankImports = pgTable("bank_imports", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  bankId: varchar("bank_id", { length: 40 }),
  accountId: varchar("account_id", { length: 80 }),
  importedById: uuid("imported_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  transactionCount: integer("transaction_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("bank_imports_store_idx").on(t.storeId), index("bank_imports_created_idx").on(t.createdAt)]);

export const bankTransactions = pgTable("bank_transactions", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  importId: uuid("import_id").notNull().references(() => bankImports.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 180 }).notNull(),
  occurredOn: date("occurred_on").notNull(),
  amountCents: integer("amount_cents").notNull(),
  memo: text("memo"),
  settlementId: uuid("settlement_id").references(() => financialSettlements.id, { onDelete: "restrict" }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  reconciledById: uuid("reconciled_by_id").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("bank_transactions_store_idx").on(t.storeId), check("bank_transactions_amount_nonzero", sql`${t.amountCents} <> 0`), uniqueIndex("bank_transactions_import_external_uidx").on(t.importId, t.externalId), index("bank_transactions_date_amount_idx").on(t.occurredOn, t.amountCents), index("bank_transactions_settlement_idx").on(t.settlementId)]);

export const playerCreditMovements = pgTable("player_credit_movements", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
  type: playerCreditMovementType("type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  balanceAfterCents: integer("balance_after_cents").notNull(),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "restrict" }),
  financialAccountId: uuid("financial_account_id").references(() => financialAccounts.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("player_credit_movements_store_idx").on(t.storeId), check("player_credit_movements_nonzero", sql`${t.amountCents} <> 0`), index("player_credit_movements_player_date_idx").on(t.playerId, t.createdAt), index("player_credit_movements_sale_idx").on(t.saleId), index("player_credit_movements_account_idx").on(t.financialAccountId)]);

export const stockMovements = pgTable("stock_movements", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  type: stockMovementType("type").notNull(), quantityDelta: integer("quantity_delta").notNull(), previousQuantity: integer("previous_quantity").notNull(), newQuantity: integer("new_quantity").notNull(),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "restrict" }), fiscalInvoiceItemId: uuid("fiscal_invoice_item_id").references((): AnyPgColumn => fiscalInvoiceItems.id, { onDelete: "restrict" }), productSplitId: uuid("product_split_id").references(() => productSplits.id, { onDelete: "restrict" }), userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }), notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("stock_movements_store_idx").on(t.storeId), index("stock_movements_product_date_idx").on(t.productId, t.createdAt), index("stock_movements_sale_idx").on(t.saleId), index("stock_movements_fiscal_item_idx").on(t.fiscalInvoiceItemId), index("stock_movements_product_split_idx").on(t.productSplitId), uniqueIndex("stock_movements_fiscal_item_type_uidx").on(t.fiscalInvoiceItemId, t.type)]);

export const inventoryCounts = pgTable("inventory_counts", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  status: inventoryCountStatus("status").default("OPEN").notNull(),
  createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  finalizedById: uuid("finalized_by_id").references(() => users.id, { onDelete: "restrict" }),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("inventory_counts_store_idx").on(t.storeId), index("inventory_counts_status_created_idx").on(t.status, t.createdAt)]);

export const inventoryCountItems = pgTable("inventory_count_items", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  countId: uuid("count_id").notNull().references(() => inventoryCounts.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  expectedQuantity: integer("expected_quantity").notNull(),
  countedQuantity: integer("counted_quantity"),
  notes: text("notes"),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (t) => [index("inventory_count_items_store_idx").on(t.storeId), check("inventory_count_items_values_valid", sql`${t.expectedQuantity} >= 0 AND (${t.countedQuantity} IS NULL OR ${t.countedQuantity} >= 0)`), uniqueIndex("inventory_count_items_count_product_uidx").on(t.countId, t.productId), index("inventory_count_items_count_idx").on(t.countId)]);

export const suppliers = pgTable("suppliers", {
  accountId: uuid("account_id").notNull().default(sql`app_current_account()`).references(() => accounts.id, { onDelete: "restrict" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  document: varchar("document", { length: 14 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 40 }),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (t) => [index("suppliers_account_idx").on(t.accountId), uniqueIndex("suppliers_account_document_uidx").on(t.accountId, t.document), index("suppliers_name_idx").on(t.name)]);

export const purchaseOrders = pgTable("purchase_orders", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  number: integer("number").generatedAlwaysAsIdentity(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
  status: purchaseOrderStatus("status").default("DRAFT").notNull(),
  expectedAt: date("expected_at"),
  fiscalInvoiceId: uuid("fiscal_invoice_id").references((): AnyPgColumn => fiscalInvoices.id, { onDelete: "restrict" }),
  notes: text("notes"),
  createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  receivedById: uuid("received_by_id").references(() => users.id, { onDelete: "restrict" }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("purchase_orders_store_idx").on(t.storeId), uniqueIndex("purchase_orders_number_uidx").on(t.number), index("purchase_orders_supplier_status_idx").on(t.supplierId, t.status), index("purchase_orders_expected_idx").on(t.expectedAt)]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  orderedQuantity: integer("ordered_quantity").notNull(),
  receivedQuantity: integer("received_quantity").default(0).notNull(),
  unitCostCents: integer("unit_cost_cents").notNull(),
  ...timestamps,
}, (t) => [index("purchase_order_items_store_idx").on(t.storeId), check("purchase_order_items_values_valid", sql`${t.orderedQuantity} > 0 AND ${t.receivedQuantity} >= 0 AND ${t.unitCostCents} >= 0`), uniqueIndex("purchase_order_items_order_product_uidx").on(t.orderId, t.productId), index("purchase_order_items_order_idx").on(t.orderId)]);

export const auditLogs = pgTable("audit_logs", {
  accountId: uuid("account_id").default(sql`app_current_account()`).references(() => accounts.id, { onDelete: "restrict" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(), entityType: varchar("entity_type", { length: 80 }).notNull(), entityId: varchar("entity_id", { length: 80 }).notNull(),
  before: jsonb("before"), after: jsonb("after"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_account_idx").on(t.accountId), index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)]);

export const sefazSyncStates = pgTable("sefaz_sync_states", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  companyCnpj: varchar("company_cnpj", { length: 14 }).notNull(),
  environment: sefazEnvironment("environment").notNull(),
  ufCode: integer("uf_code").notNull(),
  lastNsu: varchar("last_nsu", { length: 15 }).default("000000000000000").notNull(),
  maxNsu: varchar("max_nsu", { length: 15 }).default("000000000000000").notNull(),
  lastStatusCode: varchar("last_status_code", { length: 4 }),
  lastStatusMessage: text("last_status_message"),
  lastError: text("last_error"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  nextSyncAt: timestamp("next_sync_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (t) => [index("sefaz_sync_states_store_idx").on(t.storeId), 
  uniqueIndex("sefaz_sync_states_company_environment_uidx").on(t.companyCnpj, t.environment),
  index("sefaz_sync_states_next_sync_idx").on(t.nextSyncAt),
  check("sefaz_sync_states_nsu_format", sql`${t.lastNsu} ~ '^[0-9]{15}$' AND ${t.maxNsu} ~ '^[0-9]{15}$'`),
]);

export const fiscalImportBatches = pgTable("fiscal_import_batches", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  syncStateId: uuid("sync_state_id").notNull().references(() => sefazSyncStates.id, { onDelete: "restrict" }),
  importedById: uuid("imported_by_id").references(() => users.id, { onDelete: "set null" }),
  fileCount: integer("file_count").notNull(),
  importedCount: integer("imported_count").default(0).notNull(),
  duplicateCount: integer("duplicate_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  results: jsonb("results"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("fiscal_import_batches_store_idx").on(t.storeId), 
  check("fiscal_import_batches_counts_valid", sql`${t.fileCount} > 0 AND ${t.importedCount} >= 0 AND ${t.duplicateCount} >= 0 AND ${t.failedCount} >= 0`),
  index("fiscal_import_batches_created_idx").on(t.createdAt),
  index("fiscal_import_batches_state_idx").on(t.syncStateId),
]);

export const fiscalDfeDocuments = pgTable("fiscal_dfe_documents", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  syncStateId: uuid("sync_state_id").notNull().references(() => sefazSyncStates.id, { onDelete: "restrict" }),
  importBatchId: uuid("import_batch_id").references(() => fiscalImportBatches.id, { onDelete: "restrict" }),
  nsu: varchar("nsu", { length: 15 }),
  schema: varchar("schema", { length: 120 }).notNull(),
  kind: fiscalDocumentKind("kind").default("UNKNOWN").notNull(),
  accessKey: varchar("access_key", { length: 44 }),
  originalFileName: varchar("original_file_name", { length: 255 }),
  contentHash: varchar("content_hash", { length: 64 }),
  rawXml: text("raw_xml").notNull(),
  parsed: jsonb("parsed"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("fiscal_dfe_documents_store_idx").on(t.storeId), 
  uniqueIndex("fiscal_dfe_documents_state_nsu_uidx").on(t.syncStateId, t.nsu),
  uniqueIndex("fiscal_dfe_documents_state_hash_uidx").on(t.syncStateId, t.contentHash).where(sql`${t.contentHash} IS NOT NULL`),
  index("fiscal_dfe_documents_access_key_idx").on(t.accessKey),
  index("fiscal_dfe_documents_import_batch_idx").on(t.importBatchId),
  index("fiscal_dfe_documents_received_idx").on(t.receivedAt),
  check("fiscal_dfe_documents_nsu_format", sql`${t.nsu} IS NULL OR ${t.nsu} ~ '^[0-9]{15}$'`),
]);

export const fiscalInvoices = pgTable("fiscal_invoices", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  syncStateId: uuid("sync_state_id").notNull().references(() => sefazSyncStates.id, { onDelete: "restrict" }),
  sourceDocumentId: uuid("source_document_id").references(() => fiscalDfeDocuments.id, { onDelete: "restrict" }),
  accessKey: varchar("access_key", { length: 44 }).notNull(),
  hasFullXml: boolean("has_full_xml").default(false).notNull(),
  status: fiscalInvoiceStatus("status").default("UNKNOWN").notNull(),
  issuerCnpjCpf: varchar("issuer_cnpj_cpf", { length: 14 }),
  issuerName: varchar("issuer_name", { length: 180 }),
  issuerStateRegistration: varchar("issuer_state_registration", { length: 30 }),
  recipientCnpjCpf: varchar("recipient_cnpj_cpf", { length: 14 }),
  recipientName: varchar("recipient_name", { length: 180 }),
  recipientStateRegistration: varchar("recipient_state_registration", { length: 30 }),
  issueAt: timestamp("issue_at", { withTimezone: true }),
  authorizationAt: timestamp("authorization_at", { withTimezone: true }),
  operationType: integer("operation_type"),
  model: varchar("model", { length: 3 }),
  series: varchar("series", { length: 6 }),
  number: varchar("number", { length: 12 }),
  operationNature: varchar("operation_nature", { length: 180 }),
  totalCents: bigint("total_cents", { mode: "number" }),
  protocol: varchar("protocol", { length: 30 }),
  manifestationStatus: varchar("manifestation_status", { length: 40 }),
  xmlVersion: varchar("xml_version", { length: 10 }),
  ...timestamps,
}, (t) => [index("fiscal_invoices_store_idx").on(t.storeId), 
  uniqueIndex("fiscal_invoices_state_access_key_uidx").on(t.syncStateId, t.accessKey),
  index("fiscal_invoices_issue_idx").on(t.issueAt),
  index("fiscal_invoices_issuer_idx").on(t.issuerCnpjCpf),
  index("fiscal_invoices_status_idx").on(t.status),
  index("fiscal_invoices_number_idx").on(t.number),
]);

export const fiscalInvoiceItems = pgTable("fiscal_invoice_items", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => fiscalInvoices.id, { onDelete: "cascade" }),
  itemNumber: integer("item_number").notNull(),
  productCode: varchar("product_code", { length: 80 }),
  ean: varchar("ean", { length: 30 }),
  description: varchar("description", { length: 240 }).notNull(),
  ncm: varchar("ncm", { length: 12 }),
  cfop: varchar("cfop", { length: 6 }),
  unit: varchar("unit", { length: 12 }),
  quantity: numeric("quantity", { precision: 18, scale: 4 }),
  unitValueCents: bigint("unit_value_cents", { mode: "number" }),
  totalCents: bigint("total_cents", { mode: "number" }),
  discountCents: bigint("discount_cents", { mode: "number" }),
  freightCents: bigint("freight_cents", { mode: "number" }),
  insuranceCents: bigint("insurance_cents", { mode: "number" }),
  otherCents: bigint("other_cents", { mode: "number" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
  stockUnitCostCents: integer("stock_unit_cost_cents"),
  stockImportedAt: timestamp("stock_imported_at", { withTimezone: true }),
  stockReversedAt: timestamp("stock_reversed_at", { withTimezone: true }),
  stockImportError: text("stock_import_error"),
  taxes: jsonb("taxes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("fiscal_invoice_items_store_idx").on(t.storeId), 
  uniqueIndex("fiscal_invoice_items_invoice_number_uidx").on(t.invoiceId, t.itemNumber),
  index("fiscal_invoice_items_invoice_idx").on(t.invoiceId),
  index("fiscal_invoice_items_product_idx").on(t.productId),
]);

export const fiscalInvoiceEvents = pgTable("fiscal_invoice_events", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  sourceDocumentId: uuid("source_document_id").notNull().references(() => fiscalDfeDocuments.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").references(() => fiscalInvoices.id, { onDelete: "restrict" }),
  accessKey: varchar("access_key", { length: 44 }),
  eventType: varchar("event_type", { length: 12 }),
  sequence: integer("sequence"),
  eventAt: timestamp("event_at", { withTimezone: true }),
  protocol: varchar("protocol", { length: 30 }),
  statusCode: varchar("status_code", { length: 4 }),
  statusMessage: text("status_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("fiscal_invoice_events_store_idx").on(t.storeId), 
  uniqueIndex("fiscal_invoice_events_source_uidx").on(t.sourceDocumentId),
  index("fiscal_invoice_events_access_key_idx").on(t.accessKey),
  index("fiscal_invoice_events_invoice_idx").on(t.invoiceId),
]);

/* ---------------------------------------------------------------------------------------------------------------------
 * Comandas: o cliente escaneia o QR da comanda física e pede pelo celular; o pedido entra na conta e é cobrado no PDV.
 * Tudo é de uma loja só (isolado por RLS). O link do QR é assinado (ver modules/comandas/token.ts) e a tela pública só
 * funciona com a comanda aberta pelo balcão e com o celular dentro do raio da loja. Cada acesso e cada pedido vão para
 * comanda_events, que guarda IP, aparelho e localização por 90 dias e depois é anonimizado.
 * ------------------------------------------------------------------------------------------------------------------- */

/** Configuração das comandas de uma loja: liga o recurso e define onde fica a loja (para barrar pedido de longe). */
export const comandaSettings = pgTable("comanda_settings", {
  storeId: uuid("store_id").primaryKey().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  enabled: boolean("enabled").default(false).notNull(),
  requireLocation: boolean("require_location").default(true).notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  radiusMeters: integer("radius_meters").default(150).notNull(),
  ...timestamps,
}, (t) => [
  check("comanda_settings_radius_valid", sql`${t.radiusMeters} BETWEEN 20 AND 2000`),
  check("comanda_settings_coords_valid", sql`(${t.latitude} IS NULL AND ${t.longitude} IS NULL) OR (${t.latitude} BETWEEN -90 AND 90 AND ${t.longitude} BETWEEN -180 AND 180)`),
]);

/** A comanda física: um número e um QR fixos, que a loja reaproveita a cada atendimento. */
export const comandas = pgTable("comandas", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  number: integer("number").notNull(),
  active: boolean("active").default(true).notNull(),
  /** Entra na assinatura do link. Aumentar invalida o QR impresso (comanda perdida ou fotografada). */
  tokenVersion: integer("token_version").default(1).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("comandas_store_number_uidx").on(t.storeId, t.number), index("comandas_store_idx").on(t.storeId), check("comandas_number_valid", sql`${t.number} BETWEEN 1 AND 9999`)]);

/** Um atendimento: a comanda aberta para um jogador, até a conta ser cobrada (vira uma venda) ou cancelada. */
export const comandaSessions = pgTable("comanda_sessions", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  comandaId: uuid("comanda_id").notNull().references(() => comandas.id, { onDelete: "restrict" }),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
  status: varchar("status", { length: 10 }).default("OPEN").notNull(),
  openedById: uuid("opened_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedById: uuid("closed_by_id").references(() => users.id, { onDelete: "restrict" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  saleId: integer("sale_id").references((): AnyPgColumn => sales.id, { onDelete: "restrict" }),
  cancelReason: varchar("cancel_reason", { length: 200 }),
  ...timestamps,
}, (t) => [
  uniqueIndex("comanda_sessions_one_open_uidx").on(t.comandaId).where(sql`${t.status} = 'OPEN'`),
  index("comanda_sessions_store_status_idx").on(t.storeId, t.status),
  index("comanda_sessions_comanda_idx").on(t.comandaId),
  check("comanda_sessions_status_valid", sql`${t.status} IN ('OPEN','CLOSED','CANCELED')`),
]);

/** Celular que acessou a comanda (cookie próprio, guardado só como hash), com o que o navegador informa dele. */
export const comandaDevices = pgTable("comanda_devices", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => comandaSessions.id, { onDelete: "restrict" }),
  secretHash: varchar("secret_hash", { length: 64 }).notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  deviceInfo: jsonb("device_info"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
}, (t) => [index("comanda_devices_session_idx").on(t.sessionId), uniqueIndex("comanda_devices_secret_uidx").on(t.sessionId, t.secretHash)]);

/** Um pedido: o que o cliente (ou o balcão) mandou de uma vez. Entra direto na conta; só o balcão cancela. */
export const comandaOrders = pgTable("comanda_orders", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => comandaSessions.id, { onDelete: "restrict" }),
  source: varchar("source", { length: 10 }).notNull(),
  deviceId: uuid("device_id").references(() => comandaDevices.id, { onDelete: "restrict" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
  /** Identifica o envio no celular, para um toque duplo ou uma rede ruim não gerar dois pedidos. */
  requestId: uuid("request_id"),
  status: varchar("status", { length: 10 }).default("NEW").notNull(),
  note: varchar("note", { length: 200 }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deliveredById: uuid("delivered_by_id").references(() => users.id, { onDelete: "restrict" }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  canceledById: uuid("canceled_by_id").references(() => users.id, { onDelete: "restrict" }),
  cancelReason: varchar("cancel_reason", { length: 200 }),
  ...timestamps,
}, (t) => [
  index("comanda_orders_session_idx").on(t.sessionId),
  index("comanda_orders_store_status_idx").on(t.storeId, t.status),
  uniqueIndex("comanda_orders_request_uidx").on(t.sessionId, t.requestId).where(sql`${t.requestId} IS NOT NULL`),
  check("comanda_orders_status_valid", sql`${t.status} IN ('NEW','DELIVERED','CANCELED')`),
  check("comanda_orders_source_valid", sql`${t.source} IN ('CUSTOMER','COUNTER')`),
]);

/** Item do pedido, com o nome e o preço do momento (o cardápio pode mudar depois). */
export const comandaOrderItems = pgTable("comanda_order_items", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => comandaOrders.id, { onDelete: "restrict" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  productName: varchar("product_name", { length: 180 }).notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer("quantity").notNull(),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  canceledById: uuid("canceled_by_id").references(() => users.id, { onDelete: "restrict" }),
  cancelReason: varchar("cancel_reason", { length: 200 }),
}, (t) => [
  index("comanda_order_items_order_idx").on(t.orderId),
  index("comanda_order_items_product_idx").on(t.productId),
  check("comanda_order_items_quantity_valid", sql`${t.quantity} BETWEEN 1 AND 99`),
  check("comanda_order_items_price_valid", sql`${t.unitPriceCents} >= 0`),
]);

/** Auditoria das comandas: quem fez o quê, quando, de onde e de qual aparelho. Passados 90 dias, o IP e a posição são apagados. */
export const comandaEvents = pgTable("comanda_events", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  comandaId: uuid("comanda_id").references(() => comandas.id, { onDelete: "restrict" }),
  sessionId: uuid("session_id").references(() => comandaSessions.id, { onDelete: "restrict" }),
  orderId: uuid("order_id").references(() => comandaOrders.id, { onDelete: "restrict" }),
  deviceId: uuid("device_id").references(() => comandaDevices.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
  type: varchar("type", { length: 40 }).notNull(),
  outcome: varchar("outcome", { length: 10 }).default("OK").notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  deviceInfo: jsonb("device_info"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  accuracyMeters: real("accuracy_meters"),
  distanceMeters: integer("distance_meters"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
}, (t) => [
  index("comanda_events_store_created_idx").on(t.storeId, t.createdAt),
  index("comanda_events_session_idx").on(t.sessionId),
  index("comanda_events_comanda_idx").on(t.comandaId),
  check("comanda_events_outcome_valid", sql`${t.outcome} IN ('OK','BLOCKED','FAILED')`),
]);

/** Contador de tentativas por janela, para barrar abuso nas telas públicas. A chave é um hash (nunca o IP puro). */
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 160 }).primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).defaultNow().notNull(),
  hits: integer("hits").default(0).notNull(),
}, (t) => [index("rate_limits_window_idx").on(t.windowStart)]);

/* O Drizzle desta versão não tem bytea; o driver pg já entrega e recebe Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/* Impressoras térmicas dos caixas. Cada uma é atendida por um agente local (agent/) que se autentica com o token desta
 * linha (só o hash fica gravado), busca os trabalhos da fila e repassa os bytes ESC/POS à impressora. */
export const printTerminals = pgTable("print_terminals", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  columns: integer("columns").default(48).notNull(),
  codePage: varchar("code_page", { length: 10 }).default("CP860").notNull(),
  cut: boolean("cut").default(true).notNull(),
  active: boolean("active").default(true).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  agentInfo: varchar("agent_info", { length: 200 }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (t) => [
  index("print_terminals_store_idx").on(t.storeId),
  uniqueIndex("print_terminals_store_name_lower_uidx").on(t.storeId, sql`lower(${t.name})`),
  uniqueIndex("print_terminals_token_hash_uidx").on(t.tokenHash),
  check("print_terminals_columns_valid", sql`${t.columns} BETWEEN 24 AND 80`),
  check("print_terminals_code_page_valid", sql`${t.codePage} IN ('CP860','CP850','WPC1252','ASCII')`),
]);

/* Fila de impressão. O conteúdo já vai pronto em ESC/POS; o agente só repassa. QUEUED espera o agente, SENT foi entregue
 * a ele, PRINTED/FAILED é a resposta do agente (ou FAILED quando expira sem ninguém buscar). */
export const printJobs = pgTable("print_jobs", {
  storeId: uuid("store_id").notNull().default(sql`app_current_store()`).references(() => stores.id, { onDelete: "restrict" }),
  id: uuid("id").defaultRandom().primaryKey(),
  terminalId: uuid("terminal_id").notNull().references(() => printTerminals.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 30 }).notNull(),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "restrict" }),
  payload: bytea("payload").notNull(),
  status: printJobStatus("status").default("QUEUED").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  error: text("error"),
  requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("print_jobs_store_idx").on(t.storeId),
  index("print_jobs_terminal_queue_idx").on(t.terminalId, t.status, t.createdAt),
  index("print_jobs_sale_idx").on(t.saleId),
  check("print_jobs_kind_valid", sql`${t.kind} IN ('SALE_RECEIPT','TEST')`),
]);
