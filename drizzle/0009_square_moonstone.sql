CREATE TYPE "public"."cash_movement_type" AS ENUM('SUPPLY', 'WITHDRAWAL');--> statement-breakpoint
CREATE TYPE "public"."cash_session_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."inventory_count_status" AS ENUM('OPEN', 'FINALIZED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELED');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'INVENTORY_COUNT';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'PURCHASE_RECEIPT';--> statement-breakpoint
CREATE TABLE "bank_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"bank_id" varchar(40),
	"account_id" varchar(80),
	"imported_by_id" uuid NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"external_id" varchar(180) NOT NULL,
	"occurred_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"memo" text,
	"settlement_id" uuid,
	"reconciled_at" timestamp with time zone,
	"reconciled_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transactions_amount_nonzero" CHECK ("bank_transactions"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" "cash_movement_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" varchar(300) NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_amount_positive" CHECK ("cash_movements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"register_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"status" "cash_session_status" DEFAULT 'OPEN' NOT NULL,
	"opening_amount_cents" integer DEFAULT 0 NOT NULL,
	"closing_counted_cents" integer,
	"expected_amount_cents" integer,
	"difference_cents" integer,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_sessions_amounts_valid" CHECK ("cash_sessions"."opening_amount_cents" >= 0 AND ("cash_sessions"."closing_counted_cents" IS NULL OR "cash_sessions"."closing_counted_cents" >= 0))
);
--> statement-breakpoint
CREATE TABLE "inventory_count_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"expected_quantity" integer NOT NULL,
	"counted_quantity" integer,
	"notes" text,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_count_items_values_valid" CHECK ("inventory_count_items"."expected_quantity" >= 0 AND ("inventory_count_items"."counted_quantity" IS NULL OR "inventory_count_items"."counted_quantity" >= 0))
);
--> statement-breakpoint
CREATE TABLE "inventory_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"status" "inventory_count_status" DEFAULT 'OPEN' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"finalized_by_id" uuid,
	"finalized_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ordered_quantity" integer NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_items_values_valid" CHECK ("purchase_order_items"."ordered_quantity" > 0 AND "purchase_order_items"."received_quantity" >= 0 AND "purchase_order_items"."received_quantity" <= "purchase_order_items"."ordered_quantity" AND "purchase_order_items"."unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "purchase_orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"supplier_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'DRAFT' NOT NULL,
	"expected_at" date,
	"fiscal_invoice_id" uuid,
	"notes" text,
	"created_by_id" uuid NOT NULL,
	"received_by_id" uuid,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"document" varchar(14),
	"email" varchar(255),
	"phone" varchar(40),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL,
	"permission" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD COLUMN "reversed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD COLUMN "reversal_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tcg_game" varchar(80);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tcg_set_name" varchar(120);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tcg_collector_number" varchar(40);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tcg_language" varchar(40);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tcg_rarity" varchar(80);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tcg_condition" varchar(40);--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cash_session_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_imported_by_id_users_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_import_id_bank_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bank_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_settlement_id_financial_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."financial_settlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_reconciled_by_id_users_id_fk" FOREIGN KEY ("reconciled_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_register_id_cash_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_count_id_inventory_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."inventory_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_finalized_by_id_users_id_fk" FOREIGN KEY ("finalized_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_fiscal_invoice_id_fiscal_invoices_id_fk" FOREIGN KEY ("fiscal_invoice_id") REFERENCES "public"."fiscal_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_imports_created_idx" ON "bank_imports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transactions_import_external_uidx" ON "bank_transactions" USING btree ("import_id","external_id");--> statement-breakpoint
CREATE INDEX "bank_transactions_date_amount_idx" ON "bank_transactions" USING btree ("occurred_on","amount_cents");--> statement-breakpoint
CREATE INDEX "bank_transactions_settlement_idx" ON "bank_transactions" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "cash_movements_session_date_idx" ON "cash_movements" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_registers_name_lower_uidx" ON "cash_registers" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "cash_registers_active_idx" ON "cash_registers" USING btree ("active");--> statement-breakpoint
CREATE INDEX "cash_sessions_register_status_idx" ON "cash_sessions" USING btree ("register_id","status");--> statement-breakpoint
CREATE INDEX "cash_sessions_operator_status_idx" ON "cash_sessions" USING btree ("operator_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_count_items_count_product_uidx" ON "inventory_count_items" USING btree ("count_id","product_id");--> statement-breakpoint
CREATE INDEX "inventory_count_items_count_idx" ON "inventory_count_items" USING btree ("count_id");--> statement-breakpoint
CREATE INDEX "inventory_counts_status_created_idx" ON "inventory_counts" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_items_order_product_uidx" ON "purchase_order_items" USING btree ("order_id","product_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_idx" ON "purchase_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_number_uidx" ON "purchase_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_status_idx" ON "purchase_orders" USING btree ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_expected_idx" ON "purchase_orders" USING btree ("expected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_document_uidx" ON "suppliers" USING btree ("document");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permissions_user_permission_uidx" ON "user_permissions" USING btree ("user_id","permission");--> statement-breakpoint
CREATE INDEX "user_permissions_user_idx" ON "user_permissions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_reversed_by_id_users_id_fk" FOREIGN KEY ("reversed_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_cash_session_idx" ON "sales" USING btree ("cash_session_id");