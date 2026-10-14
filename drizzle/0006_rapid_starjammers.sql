ALTER TYPE "public"."stock_movement_type" ADD VALUE 'BOX_SPLIT_OUT';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'BOOSTER_SPLIT_IN';--> statement-breakpoint
CREATE TABLE "product_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_product_id" uuid NOT NULL,
	"output_product_id" uuid NOT NULL,
	"source_quantity" integer DEFAULT 1 NOT NULL,
	"output_quantity" integer NOT NULL,
	"source_unit_cost_cents" integer NOT NULL,
	"output_unit_cost_cents" integer NOT NULL,
	"output_sale_price_cents" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_splits_values_valid" CHECK ("product_splits"."source_quantity" > 0 AND "product_splits"."output_quantity" > 1 AND "product_splits"."source_unit_cost_cents" >= 0 AND "product_splits"."output_unit_cost_cents" >= 0 AND "product_splits"."output_sale_price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_loose_booster" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "products" SET "is_loose_booster"=true WHERE lower(COALESCE("description",'')) LIKE '%booster avulso%' OR "sku" IN ('MTG-FDN-BST','MTG-FDN-COL','PKM-SSP-BST');--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "product_split_id" uuid;--> statement-breakpoint
ALTER TABLE "product_splits" ADD CONSTRAINT "product_splits_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_splits" ADD CONSTRAINT "product_splits_output_product_id_products_id_fk" FOREIGN KEY ("output_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_splits" ADD CONSTRAINT "product_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_splits_source_date_idx" ON "product_splits" USING btree ("source_product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_splits_output_date_idx" ON "product_splits" USING btree ("output_product_id","created_at");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_split_id_product_splits_id_fk" FOREIGN KEY ("product_split_id") REFERENCES "public"."product_splits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_product_split_idx" ON "stock_movements" USING btree ("product_split_id");
