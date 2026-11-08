-- Endurecimento e administração do sistema: unicidade por lojista, formas de pagamento por loja, consistência de loja entre
-- tabelas pai e filha, administrador do sistema (sem lojista) e limite de lojas por lojista.
CREATE TABLE "store_payment_methods" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"code" varchar(30) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_payment_methods_store_id_code_pk" PRIMARY KEY("store_id","code")
);--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_sku_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_barcode_unique";--> statement-breakpoint
DROP INDEX "cash_registers_name_lower_uidx";--> statement-breakpoint
DROP INDEX "categories_name_lower_uidx";--> statement-breakpoint
DROP INDEX "supplier_product_mappings_supplier_code_uidx";--> statement-breakpoint
DROP INDEX "suppliers_document_uidx";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "max_stores" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "store_payment_methods" ADD CONSTRAINT "store_payment_methods_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_payment_methods" ADD CONSTRAINT "store_payment_methods_code_payment_methods_code_fk" FOREIGN KEY ("code") REFERENCES "public"."payment_methods"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_registers_store_name_lower_uidx" ON "cash_registers" USING btree ("store_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "categories_account_name_lower_uidx" ON "categories" USING btree ("account_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_account_sku_uidx" ON "products" USING btree ("account_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_account_barcode_uidx" ON "products" USING btree ("account_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_product_mappings_account_supplier_code_uidx" ON "supplier_product_mappings" USING btree ("account_id","supplier_document","supplier_product_code");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_account_document_uidx" ON "suppliers" USING btree ("account_id","document");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_max_stores_valid" CHECK ("accounts"."max_stores" IS NULL OR "accounts"."max_stores" >= 1);--> statement-breakpoint
INSERT INTO "accounts" ("name") SELECT 'Coliseu TCG' WHERE EXISTS (SELECT 1 FROM "users") AND NOT EXISTS (SELECT 1 FROM "accounts");--> statement-breakpoint
INSERT INTO "stores" ("account_id","name") SELECT a."id",'Coliseu TCG' FROM "accounts" a WHERE NOT EXISTS (SELECT 1 FROM "stores");--> statement-breakpoint
UPDATE "users" SET "account_id"=(SELECT "id" FROM "accounts" ORDER BY "created_at","id" LIMIT 1) WHERE "account_id" IS NULL AND NOT "is_platform_admin" AND EXISTS (SELECT 1 FROM "accounts");--> statement-breakpoint
INSERT INTO "store_payment_methods" ("store_id","code","active") SELECT s."id",pm."code",pm."active" FROM "stores" s CROSS JOIN "payment_methods" pm ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE FUNCTION "stores_default_payment_methods"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "store_payment_methods" ("store_id","code","active") SELECT NEW."id",pm."code",pm."active" FROM "payment_methods" pm ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "stores_default_payment_methods" AFTER INSERT ON "stores" FOR EACH ROW EXECUTE FUNCTION "stores_default_payment_methods"();--> statement-breakpoint
CREATE FUNCTION "payment_methods_to_stores"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "store_payment_methods" ("store_id","code","active") SELECT s."id",NEW."code",NEW."active" FROM "stores" s ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "payment_methods_to_stores" AFTER INSERT ON "payment_methods" FOR EACH ROW EXECUTE FUNCTION "payment_methods_to_stores"();--> statement-breakpoint
CREATE FUNCTION "enforce_same_store"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_store uuid;
DECLARE reference text;
BEGIN
  reference := to_jsonb(NEW) ->> TG_ARGV[1];
  IF reference IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT "store_id" FROM %I WHERE "id"::text = $1', TG_ARGV[0]) INTO parent_store USING reference;
  IF parent_store IS NOT NULL AND parent_store <> NEW."store_id" THEN
    RAISE EXCEPTION 'Registro de % ligado a % de outra loja', TG_TABLE_NAME, TG_ARGV[0] USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "cash_sessions_register_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","register_id" ON "cash_sessions" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('cash_registers','register_id');--> statement-breakpoint
CREATE TRIGGER "cash_movements_session_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","session_id" ON "cash_movements" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('cash_sessions','session_id');--> statement-breakpoint
CREATE TRIGGER "sales_cash_session_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","cash_session_id" ON "sales" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('cash_sessions','cash_session_id');--> statement-breakpoint
CREATE TRIGGER "sale_items_sale_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sale_id" ON "sale_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sales','sale_id');--> statement-breakpoint
CREATE TRIGGER "payments_sale_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sale_id" ON "payments" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sales','sale_id');--> statement-breakpoint
CREATE TRIGGER "financial_accounts_sale_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sale_id" ON "financial_accounts" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sales','sale_id');--> statement-breakpoint
CREATE TRIGGER "financial_installments_account_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","account_id" ON "financial_installments" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('financial_accounts','account_id');--> statement-breakpoint
CREATE TRIGGER "financial_settlements_installment_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","installment_id" ON "financial_settlements" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('financial_installments','installment_id');--> statement-breakpoint
CREATE TRIGGER "bank_transactions_import_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","import_id" ON "bank_transactions" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('bank_imports','import_id');--> statement-breakpoint
CREATE TRIGGER "bank_transactions_settlement_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","settlement_id" ON "bank_transactions" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('financial_settlements','settlement_id');--> statement-breakpoint
CREATE TRIGGER "player_credit_movements_sale_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sale_id" ON "player_credit_movements" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sales','sale_id');--> statement-breakpoint
CREATE TRIGGER "player_credit_movements_financial_account_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","financial_account_id" ON "player_credit_movements" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('financial_accounts','financial_account_id');--> statement-breakpoint
CREATE TRIGGER "stock_movements_sale_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sale_id" ON "stock_movements" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sales','sale_id');--> statement-breakpoint
CREATE TRIGGER "stock_movements_product_split_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_split_id" ON "stock_movements" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('product_splits','product_split_id');--> statement-breakpoint
CREATE TRIGGER "inventory_count_items_count_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","count_id" ON "inventory_count_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('inventory_counts','count_id');--> statement-breakpoint
CREATE TRIGGER "purchase_order_items_order_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","order_id" ON "purchase_order_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('purchase_orders','order_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_import_batches_sync_state_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sync_state_id" ON "fiscal_import_batches" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sefaz_sync_states','sync_state_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_dfe_documents_sync_state_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sync_state_id" ON "fiscal_dfe_documents" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sefaz_sync_states','sync_state_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_dfe_documents_import_batch_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","import_batch_id" ON "fiscal_dfe_documents" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('fiscal_import_batches','import_batch_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_invoices_sync_state_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sync_state_id" ON "fiscal_invoices" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sefaz_sync_states','sync_state_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_invoices_source_document_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","source_document_id" ON "fiscal_invoices" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('fiscal_dfe_documents','source_document_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_invoice_items_invoice_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","invoice_id" ON "fiscal_invoice_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('fiscal_invoices','invoice_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_invoice_events_source_document_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","source_document_id" ON "fiscal_invoice_events" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('fiscal_dfe_documents','source_document_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_invoice_events_invoice_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","invoice_id" ON "fiscal_invoice_events" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('fiscal_invoices','invoice_id');--> statement-breakpoint
CREATE TRIGGER "purchase_orders_fiscal_invoice_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","fiscal_invoice_id" ON "purchase_orders" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('fiscal_invoices','fiscal_invoice_id');--> statement-breakpoint
CREATE TRIGGER "financial_accounts_fiscal_invoice_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","fiscal_invoice_id" ON "financial_accounts" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('fiscal_invoices','fiscal_invoice_id');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_required" CHECK ("users"."account_id" IS NOT NULL OR "users"."is_platform_admin");
