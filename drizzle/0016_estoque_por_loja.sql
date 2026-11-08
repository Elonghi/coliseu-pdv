-- Estoque por loja. O saldo e o custo médio passam a viver em product_stock (uma linha por loja e produto).
-- products.stock_quantity continua existindo como o total de todas as lojas, mantido por gatilho, para scripts antigos
-- e para poder voltar à versão anterior do app; escrever nele ainda funciona (vai para a loja ativa), mas o código novo
-- usa product_stock.
CREATE TABLE "product_stock" (
	"product_id" uuid NOT NULL,
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_stock_store_id_product_id_pk" PRIMARY KEY("store_id","product_id"),
	CONSTRAINT "product_stock_values_valid" CHECK ("product_stock"."quantity" >= 0 AND "product_stock"."cost_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_stock_product_idx" ON "product_stock" USING btree ("product_id");--> statement-breakpoint
CREATE FUNCTION "app_store_ids"() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN COALESCE(current_setting('app.store_ids', true), '') <> ''
    THEN string_to_array(current_setting('app.store_ids', true), ',')::uuid[]
    ELSE COALESCE((SELECT array_agg("id") FROM "stores" WHERE (SELECT count(*) FROM "stores") = 1), '{}'::uuid[]) END
$$;--> statement-breakpoint
INSERT INTO "product_stock" ("product_id","store_id","quantity","cost_cents")
  SELECT p."id", app_current_store(), p."stock_quantity", p."cost_cents" FROM "products" p WHERE app_current_store() IS NOT NULL
  ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE FUNCTION "products_stock_to_ledger"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "product_stock" ("product_id","store_id","quantity","cost_cents")
  VALUES (NEW."id", app_current_store(), NEW."stock_quantity", NEW."cost_cents")
  ON CONFLICT ("store_id","product_id") DO UPDATE SET "quantity" = EXCLUDED."quantity", "updated_at" = now();
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "products_stock_insert" AFTER INSERT ON "products" FOR EACH ROW
  WHEN (pg_trigger_depth() < 1 AND NEW."stock_quantity" > 0) EXECUTE FUNCTION "products_stock_to_ledger"();--> statement-breakpoint
CREATE TRIGGER "products_stock_update" AFTER UPDATE OF "stock_quantity" ON "products" FOR EACH ROW
  WHEN (pg_trigger_depth() < 1 AND OLD."stock_quantity" IS DISTINCT FROM NEW."stock_quantity") EXECUTE FUNCTION "products_stock_to_ledger"();--> statement-breakpoint
CREATE FUNCTION "product_stock_to_products"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD."product_id" ELSE NEW."product_id" END;
  UPDATE "products" SET "stock_quantity" = COALESCE((SELECT sum("quantity") FROM "product_stock" WHERE "product_id" = target), 0) WHERE "id" = target;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "product_stock_sync" AFTER INSERT OR UPDATE OR DELETE ON "product_stock" FOR EACH ROW
  WHEN (pg_trigger_depth() < 1) EXECUTE FUNCTION "product_stock_to_products"();
