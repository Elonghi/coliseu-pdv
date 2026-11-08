-- Separação dos dados por lojista (conta) e por loja, etapa 1: colunas, chaves e índices. Aditiva.
-- Cada coluna nova tem um padrão calculado pelo banco: o valor de app.account_id / app.store_id da sessão ou,
-- enquanto existir exatamente uma conta (ou uma loja), essa única. Assim o código atual continua gravando certo sem mudar,
-- e uma segunda loja criada antes de o código escolher a loja ativa faz a gravação falhar (NOT NULL) em vez de misturar dados.
CREATE FUNCTION "app_current_account"() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.account_id', true), '')::uuid,
    CASE WHEN (SELECT count(*) FROM "accounts") = 1 THEN (SELECT "id" FROM "accounts") END)
$$;--> statement-breakpoint
CREATE FUNCTION "app_current_store"() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.store_id', true), '')::uuid,
    CASE WHEN (SELECT count(*) FROM "stores") = 1 THEN (SELECT "id" FROM "stores") END)
$$;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_id" SET DEFAULT app_current_account();--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "account_id" uuid DEFAULT app_current_account();--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_imports" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "account_id" uuid DEFAULT app_current_account() NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_installments" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_import_batches" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_events" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_invoices" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "player_credit_movements" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "account_id" uuid DEFAULT app_current_account() NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "product_splits" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "account_id" uuid DEFAULT app_current_account() NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "sefaz_sync_states" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "store_id" uuid DEFAULT app_current_store() NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_product_mappings" ADD COLUMN "account_id" uuid DEFAULT app_current_account() NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_product_mappings" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "account_id" uuid DEFAULT app_current_account() NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_installments" ADD CONSTRAINT "financial_installments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ADD CONSTRAINT "fiscal_dfe_documents_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_import_batches" ADD CONSTRAINT "fiscal_import_batches_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_events" ADD CONSTRAINT "fiscal_invoice_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD CONSTRAINT "fiscal_invoice_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_credit_movements" ADD CONSTRAINT "player_credit_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_splits" ADD CONSTRAINT "product_splits_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sefaz_sync_states" ADD CONSTRAINT "sefaz_sync_states_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_product_mappings" ADD CONSTRAINT "supplier_product_mappings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_product_mappings" ADD CONSTRAINT "supplier_product_mappings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_account_idx" ON "audit_logs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "bank_imports_store_idx" ON "bank_imports" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "bank_transactions_store_idx" ON "bank_transactions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "cash_movements_store_idx" ON "cash_movements" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "cash_registers_store_idx" ON "cash_registers" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "cash_sessions_store_idx" ON "cash_sessions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "categories_account_idx" ON "categories" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_store_idx" ON "financial_accounts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "financial_installments_store_idx" ON "financial_installments" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "financial_settlements_store_idx" ON "financial_settlements" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "fiscal_dfe_documents_store_idx" ON "fiscal_dfe_documents" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "fiscal_import_batches_store_idx" ON "fiscal_import_batches" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "fiscal_invoice_events_store_idx" ON "fiscal_invoice_events" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "fiscal_invoice_items_store_idx" ON "fiscal_invoice_items" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "fiscal_invoices_store_idx" ON "fiscal_invoices" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "inventory_count_items_store_idx" ON "inventory_count_items" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "inventory_counts_store_idx" ON "inventory_counts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "payments_store_idx" ON "payments" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "player_credit_movements_store_idx" ON "player_credit_movements" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "players_account_idx" ON "players" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "product_splits_store_idx" ON "product_splits" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "products_account_idx" ON "products" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_store_idx" ON "purchase_order_items" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_store_idx" ON "purchase_orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "sale_items_store_idx" ON "sale_items" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "sales_store_idx" ON "sales" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "sefaz_sync_states_store_idx" ON "sefaz_sync_states" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "stock_movements_store_idx" ON "stock_movements" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "supplier_product_mappings_account_idx" ON "supplier_product_mappings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "suppliers_account_idx" ON "suppliers" USING btree ("account_id");