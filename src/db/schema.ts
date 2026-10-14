import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "OPERATOR"]);
export const saleStatus = pgEnum("sale_status", ["CONFIRMED", "CANCELED"]);
export const stockMovementType = pgEnum("stock_movement_type", ["INITIAL", "MANUAL_IN", "MANUAL_ADJUSTMENT", "SALE", "SALE_CANCELLATION", "RETURN"]);
export const financialAccountType = pgEnum("financial_account_type", ["PAYABLE", "RECEIVABLE"]);
export const financialStatus = pgEnum("financial_status", ["OPEN", "PARTIAL", "SETTLED", "CANCELED"]);
export const playerCreditMovementType = pgEnum("player_credit_movement_type", ["MANUAL", "SALE_CREDIT", "FUTURE_CHARGE", "FUTURE_PAYMENT", "SALE_REVERSAL"]);
export const sefazEnvironment = pgEnum("sefaz_environment", ["PRODUCTION", "HOMOLOGATION"]);
export const fiscalDocumentKind = pgEnum("fiscal_document_kind", ["SUMMARY", "NFE", "EVENT", "UNKNOWN"]);
export const fiscalInvoiceStatus = pgEnum("fiscal_invoice_status", ["AUTHORIZED", "CANCELED", "DENIED", "UNKNOWN"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("users_email_lower_uidx").on(sql`lower(${t.email})`), index("users_role_active_idx").on(t.role, t.active)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(), name: varchar("name", { length: 100 }).notNull(), active: boolean("active").default(true).notNull(), ...timestamps,
}, (t) => [uniqueIndex("categories_name_lower_uidx").on(sql`lower(${t.name})`), index("categories_active_idx").on(t.active)]);

export const units = pgTable("units", {
  id: uuid("id").defaultRandom().primaryKey(), code: varchar("code", { length: 12 }).notNull().unique(), name: varchar("name", { length: 50 }).notNull(), active: boolean("active").default(true).notNull(), ...timestamps,
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  sku: varchar("sku", { length: 60 }).notNull().unique(),
  barcode: varchar("barcode", { length: 64 }).unique(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"), imageKey: text("image_key"),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "restrict" }),
  costCents: integer("cost_cents").notNull(), salePriceCents: integer("sale_price_cents").notNull(),
  maxDiscountBps: integer("max_discount_bps").default(0).notNull(),
  stockQuantity: integer("stock_quantity").default(0).notNull(), minimumStock: integer("minimum_stock").default(0).notNull(),
  active: boolean("active").default(true).notNull(), ...timestamps,
}, (t) => [
  check("products_money_nonnegative", sql`${t.costCents} >= 0 AND ${t.salePriceCents} >= 0`),
  check("products_discount_valid", sql`${t.maxDiscountBps} BETWEEN 0 AND 10000`),
  check("products_stock_nonnegative", sql`${t.stockQuantity} >= 0 AND ${t.minimumStock} >= 0`),
  index("products_name_idx").on(t.name), index("products_active_idx").on(t.active), index("products_category_idx").on(t.categoryId),
]);

export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 40 }),
  notes: text("notes"),
  creditBalanceCents: integer("credit_balance_cents").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (t) => [index("players_name_idx").on(t.name), index("players_active_idx").on(t.active), index("players_email_idx").on(t.email)]);

export const sales = pgTable("sales", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  operatorId: uuid("operator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: saleStatus("status").default("CONFIRMED").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(), discountCents: integer("discount_cents").notNull(), totalCents: integer("total_cents").notNull(),
  canceledById: uuid("canceled_by_id").references(() => users.id, { onDelete: "restrict" }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }), cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("sales_created_idx").on(t.createdAt), index("sales_operator_idx").on(t.operatorId), index("sales_status_idx").on(t.status)]);

export const saleItems = pgTable("sale_items", {
  id: uuid("id").defaultRandom().primaryKey(), saleId: integer("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  productName: varchar("product_name", { length: 180 }).notNull(), sku: varchar("sku", { length: 60 }).notNull(), unitCode: varchar("unit_code", { length: 12 }).notNull(),
  quantity: integer("quantity").notNull(), unitPriceCents: integer("unit_price_cents").notNull(), unitCostCents: integer("unit_cost_cents").notNull(),
  discountBps: integer("discount_bps").notNull(), grossCents: integer("gross_cents").notNull(), discountCents: integer("discount_cents").notNull(), totalCents: integer("total_cents").notNull(),
}, (t) => [check("sale_items_quantity_positive", sql`${t.quantity} > 0`), index("sale_items_sale_idx").on(t.saleId), index("sale_items_product_idx").on(t.productId)]);

export const paymentMethods = pgTable("payment_methods", {
  code: varchar("code", { length: 30 }).primaryKey(), name: varchar("name", { length: 80 }).notNull(), active: boolean("active").default(true).notNull(), sortOrder: integer("sort_order").default(0).notNull(), ...timestamps,
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(), saleId: integer("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }),
  methodCode: varchar("method_code", { length: 30 }).notNull().references(() => paymentMethods.code, { onDelete: "restrict" }),
  playerId: uuid("player_id").references(() => players.id, { onDelete: "restrict" }),
  dueDate: date("due_date"),
  amountAppliedCents: integer("amount_applied_cents").notNull(), amountReceivedCents: integer("amount_received_cents"), changeCents: integer("change_cents").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("payments_amount_positive", sql`${t.amountAppliedCents} > 0 AND ${t.changeCents} >= 0`), uniqueIndex("payments_sale_method_uidx").on(t.saleId, t.methodCode), index("payments_method_idx").on(t.methodCode), index("payments_player_idx").on(t.playerId)]);

export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: financialAccountType("type").notNull(),
  description: varchar("description", { length: 220 }).notNull(),
  counterpartyName: varchar("counterparty_name", { length: 180 }).notNull(),
  playerId: uuid("player_id").references(() => players.id, { onDelete: "restrict" }),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "restrict" }),
  issueDate: date("issue_date").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: financialStatus("status").default("OPEN").notNull(),
  notes: text("notes"),
  createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (t) => [check("financial_accounts_total_positive", sql`${t.totalCents} > 0`), index("financial_accounts_type_status_idx").on(t.type, t.status), index("financial_accounts_sale_idx").on(t.saleId), index("financial_accounts_player_idx").on(t.playerId), index("financial_accounts_created_idx").on(t.createdAt)]);

export const financialInstallments = pgTable("financial_installments", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => financialAccounts.id, { onDelete: "restrict" }),
  installmentNumber: integer("installment_number").notNull(),
  dueDate: date("due_date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  settledCents: integer("settled_cents").default(0).notNull(),
  status: financialStatus("status").default("OPEN").notNull(),
  ...timestamps,
}, (t) => [check("financial_installments_values_valid", sql`${t.installmentNumber} > 0 AND ${t.amountCents} > 0 AND ${t.settledCents} >= 0 AND ${t.settledCents} <= ${t.amountCents}`), uniqueIndex("financial_installments_account_number_uidx").on(t.accountId, t.installmentNumber), index("financial_installments_due_status_idx").on(t.dueDate, t.status)]);

export const financialSettlements = pgTable("financial_settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  installmentId: uuid("installment_id").notNull().references(() => financialInstallments.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  methodCode: varchar("method_code", { length: 30 }).notNull().references(() => paymentMethods.code, { onDelete: "restrict" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  personName: varchar("person_name", { length: 180 }),
  notes: text("notes"),
  createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("financial_settlements_amount_positive", sql`${t.amountCents} > 0`), index("financial_settlements_installment_idx").on(t.installmentId), index("financial_settlements_occurred_idx").on(t.occurredAt)]);

export const playerCreditMovements = pgTable("player_credit_movements", {
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
}, (t) => [check("player_credit_movements_nonzero", sql`${t.amountCents} <> 0`), index("player_credit_movements_player_date_idx").on(t.playerId, t.createdAt), index("player_credit_movements_sale_idx").on(t.saleId), index("player_credit_movements_account_idx").on(t.financialAccountId)]);

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  type: stockMovementType("type").notNull(), quantityDelta: integer("quantity_delta").notNull(), previousQuantity: integer("previous_quantity").notNull(), newQuantity: integer("new_quantity").notNull(),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "restrict" }), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }), notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("stock_movements_product_date_idx").on(t.productId, t.createdAt), index("stock_movements_sale_idx").on(t.saleId)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(), entityType: varchar("entity_type", { length: 80 }).notNull(), entityId: varchar("entity_id", { length: 80 }).notNull(),
  before: jsonb("before"), after: jsonb("after"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)]);

export const sefazSyncStates = pgTable("sefaz_sync_states", {
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
}, (t) => [
  uniqueIndex("sefaz_sync_states_company_environment_uidx").on(t.companyCnpj, t.environment),
  index("sefaz_sync_states_next_sync_idx").on(t.nextSyncAt),
  check("sefaz_sync_states_nsu_format", sql`${t.lastNsu} ~ '^[0-9]{15}$' AND ${t.maxNsu} ~ '^[0-9]{15}$'`),
]);

export const fiscalImportBatches = pgTable("fiscal_import_batches", {
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
}, (t) => [
  check("fiscal_import_batches_counts_valid", sql`${t.fileCount} > 0 AND ${t.importedCount} >= 0 AND ${t.duplicateCount} >= 0 AND ${t.failedCount} >= 0`),
  index("fiscal_import_batches_created_idx").on(t.createdAt),
  index("fiscal_import_batches_state_idx").on(t.syncStateId),
]);

export const fiscalDfeDocuments = pgTable("fiscal_dfe_documents", {
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
}, (t) => [
  uniqueIndex("fiscal_dfe_documents_state_nsu_uidx").on(t.syncStateId, t.nsu),
  uniqueIndex("fiscal_dfe_documents_state_hash_uidx").on(t.syncStateId, t.contentHash).where(sql`${t.contentHash} IS NOT NULL`),
  index("fiscal_dfe_documents_access_key_idx").on(t.accessKey),
  index("fiscal_dfe_documents_import_batch_idx").on(t.importBatchId),
  index("fiscal_dfe_documents_received_idx").on(t.receivedAt),
  check("fiscal_dfe_documents_nsu_format", sql`${t.nsu} IS NULL OR ${t.nsu} ~ '^[0-9]{15}$'`),
]);

export const fiscalInvoices = pgTable("fiscal_invoices", {
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
}, (t) => [
  uniqueIndex("fiscal_invoices_state_access_key_uidx").on(t.syncStateId, t.accessKey),
  index("fiscal_invoices_issue_idx").on(t.issueAt),
  index("fiscal_invoices_issuer_idx").on(t.issuerCnpjCpf),
  index("fiscal_invoices_status_idx").on(t.status),
  index("fiscal_invoices_number_idx").on(t.number),
]);

export const fiscalInvoiceItems = pgTable("fiscal_invoice_items", {
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
  taxes: jsonb("taxes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("fiscal_invoice_items_invoice_number_uidx").on(t.invoiceId, t.itemNumber),
  index("fiscal_invoice_items_invoice_idx").on(t.invoiceId),
]);

export const fiscalInvoiceEvents = pgTable("fiscal_invoice_events", {
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
}, (t) => [
  uniqueIndex("fiscal_invoice_events_source_uidx").on(t.sourceDocumentId),
  index("fiscal_invoice_events_access_key_idx").on(t.accessKey),
  index("fiscal_invoice_events_invoice_idx").on(t.invoiceId),
]);
