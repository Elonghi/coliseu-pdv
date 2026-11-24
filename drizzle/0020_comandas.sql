CREATE TABLE "comanda_devices" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"secret_hash" varchar(64) NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"device_info" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anonymized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comanda_events" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comanda_id" uuid,
	"session_id" uuid,
	"order_id" uuid,
	"device_id" uuid,
	"actor_user_id" uuid,
	"type" varchar(40) NOT NULL,
	"outcome" varchar(10) DEFAULT 'OK' NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"device_info" jsonb,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_meters" real,
	"distance_meters" integer,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anonymized_at" timestamp with time zone,
	CONSTRAINT "comanda_events_outcome_valid" CHECK ("comanda_events"."outcome" IN ('OK','BLOCKED','FAILED'))
);
--> statement-breakpoint
CREATE TABLE "comanda_order_items" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" varchar(180) NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"canceled_at" timestamp with time zone,
	"canceled_by_id" uuid,
	"cancel_reason" varchar(200),
	CONSTRAINT "comanda_order_items_quantity_valid" CHECK ("comanda_order_items"."quantity" BETWEEN 1 AND 99),
	CONSTRAINT "comanda_order_items_price_valid" CHECK ("comanda_order_items"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "comanda_orders" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"source" varchar(10) NOT NULL,
	"device_id" uuid,
	"created_by_id" uuid,
	"request_id" uuid,
	"status" varchar(10) DEFAULT 'NEW' NOT NULL,
	"note" varchar(200),
	"delivered_at" timestamp with time zone,
	"delivered_by_id" uuid,
	"canceled_at" timestamp with time zone,
	"canceled_by_id" uuid,
	"cancel_reason" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comanda_orders_status_valid" CHECK ("comanda_orders"."status" IN ('NEW','DELIVERED','CANCELED')),
	CONSTRAINT "comanda_orders_source_valid" CHECK ("comanda_orders"."source" IN ('CUSTOMER','COUNTER'))
);
--> statement-breakpoint
CREATE TABLE "comanda_sessions" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comanda_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" varchar(10) DEFAULT 'OPEN' NOT NULL,
	"opened_by_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by_id" uuid,
	"closed_at" timestamp with time zone,
	"sale_id" integer,
	"cancel_reason" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comanda_sessions_status_valid" CHECK ("comanda_sessions"."status" IN ('OPEN','CLOSED','CANCELED'))
);
--> statement-breakpoint
CREATE TABLE "comanda_settings" (
	"store_id" uuid PRIMARY KEY DEFAULT app_current_store() NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"require_location" boolean DEFAULT true NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"radius_meters" integer DEFAULT 150 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comanda_settings_radius_valid" CHECK ("comanda_settings"."radius_meters" BETWEEN 20 AND 2000),
	CONSTRAINT "comanda_settings_coords_valid" CHECK (("comanda_settings"."latitude" IS NULL AND "comanda_settings"."longitude" IS NULL) OR ("comanda_settings"."latitude" BETWEEN -90 AND 90 AND "comanda_settings"."longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "comandas" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comandas_number_valid" CHECK ("comandas"."number" BETWEEN 1 AND 9999)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(160) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "provisional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "available_on_comanda" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "comanda_session_id" uuid;--> statement-breakpoint
ALTER TABLE "comanda_devices" ADD CONSTRAINT "comanda_devices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_devices" ADD CONSTRAINT "comanda_devices_session_id_comanda_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."comanda_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_events" ADD CONSTRAINT "comanda_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_events" ADD CONSTRAINT "comanda_events_comanda_id_comandas_id_fk" FOREIGN KEY ("comanda_id") REFERENCES "public"."comandas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_events" ADD CONSTRAINT "comanda_events_session_id_comanda_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."comanda_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_events" ADD CONSTRAINT "comanda_events_order_id_comanda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."comanda_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_events" ADD CONSTRAINT "comanda_events_device_id_comanda_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."comanda_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_events" ADD CONSTRAINT "comanda_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_order_items" ADD CONSTRAINT "comanda_order_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_order_items" ADD CONSTRAINT "comanda_order_items_order_id_comanda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."comanda_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_order_items" ADD CONSTRAINT "comanda_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_order_items" ADD CONSTRAINT "comanda_order_items_canceled_by_id_users_id_fk" FOREIGN KEY ("canceled_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_orders" ADD CONSTRAINT "comanda_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_orders" ADD CONSTRAINT "comanda_orders_session_id_comanda_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."comanda_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_orders" ADD CONSTRAINT "comanda_orders_device_id_comanda_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."comanda_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_orders" ADD CONSTRAINT "comanda_orders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_orders" ADD CONSTRAINT "comanda_orders_delivered_by_id_users_id_fk" FOREIGN KEY ("delivered_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_orders" ADD CONSTRAINT "comanda_orders_canceled_by_id_users_id_fk" FOREIGN KEY ("canceled_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_sessions" ADD CONSTRAINT "comanda_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_sessions" ADD CONSTRAINT "comanda_sessions_comanda_id_comandas_id_fk" FOREIGN KEY ("comanda_id") REFERENCES "public"."comandas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_sessions" ADD CONSTRAINT "comanda_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_sessions" ADD CONSTRAINT "comanda_sessions_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_sessions" ADD CONSTRAINT "comanda_sessions_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_sessions" ADD CONSTRAINT "comanda_sessions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comanda_settings" ADD CONSTRAINT "comanda_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comanda_devices_session_idx" ON "comanda_devices" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comanda_devices_secret_uidx" ON "comanda_devices" USING btree ("session_id","secret_hash");--> statement-breakpoint
CREATE INDEX "comanda_events_store_created_idx" ON "comanda_events" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "comanda_events_session_idx" ON "comanda_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "comanda_events_comanda_idx" ON "comanda_events" USING btree ("comanda_id");--> statement-breakpoint
CREATE INDEX "comanda_order_items_order_idx" ON "comanda_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "comanda_order_items_product_idx" ON "comanda_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "comanda_orders_session_idx" ON "comanda_orders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "comanda_orders_store_status_idx" ON "comanda_orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "comanda_orders_request_uidx" ON "comanda_orders" USING btree ("session_id","request_id") WHERE "comanda_orders"."request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "comanda_sessions_one_open_uidx" ON "comanda_sessions" USING btree ("comanda_id") WHERE "comanda_sessions"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "comanda_sessions_store_status_idx" ON "comanda_sessions" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "comanda_sessions_comanda_idx" ON "comanda_sessions" USING btree ("comanda_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comandas_store_number_uidx" ON "comandas" USING btree ("store_id","number");--> statement-breakpoint
CREATE INDEX "comandas_store_idx" ON "comandas" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_comanda_session_id_comanda_sessions_id_fk" FOREIGN KEY ("comanda_session_id") REFERENCES "public"."comanda_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_comanda_session_uidx" ON "sales" USING btree ("comanda_session_id") WHERE "sales"."comanda_session_id" IS NOT NULL;--> statement-breakpoint
-- ===================================================================================================================
-- Comandas: travas por loja, consistência entre tabelas, consulta segura do link público e anonimização da auditoria.
-- ===================================================================================================================

-- 1) Travas (RLS): cada linha só é visível e gravável dentro do escopo da loja da requisição.
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comanda_settings', 'comandas', 'comanda_sessions', 'comanda_devices', 'comanda_orders', 'comanda_order_items', 'comanda_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "tenant_isolation" ON %I USING ("store_id" = ANY(app_scope_stores())) WITH CHECK ("store_id" = ANY(app_scope_stores()))', t);
  END LOOP;
END $rls$;--> statement-breakpoint

-- 2) Cada linha filha precisa ser da mesma loja da linha pai (e do produto, que pode ser compartilhado).
CREATE TRIGGER "comanda_sessions_comanda_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","comanda_id" ON "comanda_sessions" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comandas','comanda_id');--> statement-breakpoint
CREATE TRIGGER "comanda_devices_session_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","session_id" ON "comanda_devices" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comanda_sessions','session_id');--> statement-breakpoint
CREATE TRIGGER "comanda_orders_session_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","session_id" ON "comanda_orders" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comanda_sessions','session_id');--> statement-breakpoint
CREATE TRIGGER "comanda_orders_device_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","device_id" ON "comanda_orders" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comanda_devices','device_id');--> statement-breakpoint
CREATE TRIGGER "comanda_order_items_order_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","order_id" ON "comanda_order_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comanda_orders','order_id');--> statement-breakpoint
CREATE TRIGGER "comanda_order_items_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_id" ON "comanda_order_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','product_id');--> statement-breakpoint
CREATE TRIGGER "comanda_events_comanda_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","comanda_id" ON "comanda_events" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comandas','comanda_id');--> statement-breakpoint
CREATE TRIGGER "comanda_events_session_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","session_id" ON "comanda_events" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comanda_sessions','session_id');--> statement-breakpoint
CREATE TRIGGER "comanda_events_order_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","order_id" ON "comanda_events" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comanda_orders','order_id');--> statement-breakpoint
CREATE TRIGGER "comanda_events_device_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","device_id" ON "comanda_events" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comanda_devices','device_id');--> statement-breakpoint
CREATE TRIGGER "sales_comanda_session_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","comanda_session_id" ON "sales" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('comanda_sessions','comanda_session_id');--> statement-breakpoint

-- 3) O jogador da comanda é do mesmo lojista e, se for de uma loja só, dessa loja.
CREATE FUNCTION "comanda_session_player_scope"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p_account uuid; p_store uuid; s_account uuid;
BEGIN
  SELECT "account_id","store_id" INTO p_account,p_store FROM "players" WHERE "id" = NEW."player_id";
  SELECT "account_id" INTO s_account FROM "stores" WHERE "id" = NEW."store_id";
  IF p_account IS DISTINCT FROM s_account OR (p_store IS NOT NULL AND p_store <> NEW."store_id") THEN
    RAISE EXCEPTION 'Jogador de outro lojista ou de outra loja' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "comanda_sessions_player_scope" BEFORE INSERT OR UPDATE OF "store_id","player_id" ON "comanda_sessions" FOR EACH ROW EXECUTE FUNCTION "comanda_session_player_scope"();--> statement-breakpoint

-- 4) Uma abertura cobrada (CLOSED) tem a venda que a cobrou; as demais não têm.
ALTER TABLE "comanda_sessions" ADD CONSTRAINT "comanda_sessions_sale_matches_status" CHECK (("status" = 'CLOSED') = ("sale_id" IS NOT NULL));--> statement-breakpoint

-- 5) Consulta do link público. Quem escaneia o QR ainda não tem sessão nem escopo de loja, e sob RLS as tabelas de loja não mostram nada
--    sem escopo. Esta função devolve só o necessário para conferir a assinatura do link (ver modules/comandas/token.ts) e abrir o
--    escopo certo; todo o resto roda depois, já com o escopo da loja da comanda.
CREATE FUNCTION "comanda_public_lookup"(p_id uuid)
RETURNS TABLE ("comanda_id" uuid, "store_id" uuid, "account_id" uuid, "number" integer, "active" boolean, "token_version" integer, "store_name" varchar, "store_active" boolean, "account_active" boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c."id", c."store_id", s."account_id", c."number", c."active", c."token_version", s."name", s."active", a."active"
  FROM "comandas" c JOIN "stores" s ON s."id" = c."store_id" JOIN "accounts" a ON a."id" = s."account_id" WHERE c."id" = p_id
$$;--> statement-breakpoint

-- 6) Anonimização da auditoria (LGPD): passados os dias de retenção, o IP perde o final e a posição exata é apagada. O aparelho, o
--    horário e o resultado ficam. Serve a todas as lojas, por isso é SECURITY DEFINER; só atualiza as colunas de identificação.
CREATE FUNCTION "comanda_anonymize_ip"(ip text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN ip IS NULL THEN NULL
    WHEN ip ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' THEN regexp_replace(ip, '\.[0-9]{1,3}$', '.0')
    WHEN ip ~ '^[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}:' THEN (regexp_match(ip, '^([0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}):'))[1] || '::'
    ELSE NULL
  END
$$;--> statement-breakpoint
CREATE FUNCTION "comanda_anonymize_old"(p_days integer DEFAULT 90) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; m integer;
BEGIN
  UPDATE "comanda_events" SET "ip" = comanda_anonymize_ip("ip"), "latitude" = NULL, "longitude" = NULL, "accuracy_meters" = NULL, "anonymized_at" = now()
    WHERE "anonymized_at" IS NULL AND "created_at" < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE "comanda_devices" SET "ip" = comanda_anonymize_ip("ip"), "anonymized_at" = now()
    WHERE "anonymized_at" IS NULL AND "last_seen_at" < now() - make_interval(days => p_days);
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END $$;
