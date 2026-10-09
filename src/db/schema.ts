import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "OPERATOR"]);
export const saleStatus = pgEnum("sale_status", ["CONFIRMED", "CANCELED"]);
export const stockMovementType = pgEnum("stock_movement_type", ["INITIAL", "MANUAL_IN", "MANUAL_ADJUSTMENT", "SALE", "SALE_CANCELLATION", "RETURN"]);
export const financialAccountType = pgEnum("financial_account_type", ["PAYABLE", "RECEIVABLE"]);
export const financialStatus = pgEnum("financial_status", ["OPEN", "PARTIAL", "SETTLED", "CANCELED"]);
export const playerCreditMovementType = pgEnum("player_credit_movement_type", ["MANUAL", "SALE_CREDIT", "FUTURE_CHARGE", "FUTURE_PAYMENT", "SALE_REVERSAL"]);

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
