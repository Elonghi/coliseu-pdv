-- Travas no banco (Row-Level Security). Cada linha só é visível, e só pode ser gravada, dentro do escopo da requisição:
-- app.account_id (o lojista), app.store_ids (as lojas visíveis) e app.platform (administrador do sistema), definidos pelo
-- pool do app. Sem escopo, as tabelas de loja e do lojista não mostram nada (falha fechada); as tabelas de identidade
-- (contas, lojas, usuários, sessões) ficam abertas só sem escopo, porque o login precisa achar o usuário pelo e-mail.
-- O RLS só vale para um papel que não seja superusuário: veja scripts/create-app-role.mjs e docs/RUNBOOK_MIGRACAO.md.
CREATE FUNCTION "app_scope_account"() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.account_id', true), '')::uuid
$$;--> statement-breakpoint
CREATE FUNCTION "app_scope_stores"() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN COALESCE(current_setting('app.store_ids', true), '') = '' THEN '{}'::uuid[]
    ELSE string_to_array(current_setting('app.store_ids', true), ',')::uuid[] END
$$;--> statement-breakpoint
CREATE FUNCTION "app_scope_platform"() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.platform', true), '') = 'true'
$$;--> statement-breakpoint
CREATE FUNCTION "app_scope_active"() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_scope_account() IS NOT NULL OR app_scope_platform() OR cardinality(app_scope_stores()) > 0
$$;--> statement-breakpoint
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_imports', 'bank_transactions', 'cash_movements', 'cash_registers', 'cash_sessions', 'financial_accounts', 'financial_installments', 'financial_settlements', 'fiscal_dfe_documents', 'fiscal_import_batches', 'fiscal_invoice_events', 'fiscal_invoice_items', 'fiscal_invoices', 'inventory_count_items', 'inventory_counts', 'payments', 'player_credit_movements', 'product_splits', 'product_stock', 'purchase_order_items', 'purchase_orders', 'sale_items', 'sales', 'sefaz_sync_states', 'stock_movements', 'store_payment_methods'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "tenant_isolation" ON %I USING ("store_id" = ANY(app_scope_stores())) WITH CHECK ("store_id" = ANY(app_scope_stores()))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['categories', 'players', 'products', 'supplier_product_mappings', 'suppliers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "tenant_isolation" ON %I USING ("account_id" = app_scope_account() AND ("store_id" IS NULL OR "store_id" = ANY(app_scope_stores()))) WITH CHECK ("account_id" = app_scope_account() AND ("store_id" IS NULL OR "store_id" = ANY(app_scope_stores())))', t);
  END LOOP;
END $rls$;--> statement-breakpoint
CREATE POLICY "platform_read" ON "sefaz_sync_states" FOR SELECT USING (app_scope_platform());--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "accounts" USING (NOT app_scope_active() OR app_scope_platform() OR "id" = app_scope_account()) WITH CHECK (NOT app_scope_active() OR app_scope_platform() OR "id" = app_scope_account());--> statement-breakpoint
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stores" USING (NOT app_scope_active() OR app_scope_platform() OR "account_id" = app_scope_account()) WITH CHECK (NOT app_scope_active() OR app_scope_platform() OR "account_id" = app_scope_account());--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "users" USING (NOT app_scope_active() OR app_scope_platform() OR "account_id" = app_scope_account()) WITH CHECK (NOT app_scope_active() OR app_scope_platform() OR "account_id" = app_scope_account());--> statement-breakpoint
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessions', 'user_permissions', 'user_stores'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "tenant_isolation" ON %I USING (NOT app_scope_active() OR app_scope_platform() OR EXISTS (SELECT 1 FROM "users" u WHERE u."id" = %I."user_id" AND u."account_id" = app_scope_account())) WITH CHECK (NOT app_scope_active() OR app_scope_platform() OR EXISTS (SELECT 1 FROM "users" u WHERE u."id" = %I."user_id" AND u."account_id" = app_scope_account()))', t, t, t);
  END LOOP;
END $rls$;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_read" ON "audit_logs" FOR SELECT USING (app_scope_platform() OR "account_id" = app_scope_account());--> statement-breakpoint
CREATE POLICY "audit_write" ON "audit_logs" FOR INSERT WITH CHECK (NOT app_scope_active() OR app_scope_platform() OR "account_id" = app_scope_account());
