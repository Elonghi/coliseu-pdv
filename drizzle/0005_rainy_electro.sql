ALTER TYPE "public"."stock_movement_type" ADD VALUE 'FISCAL_ENTRY';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'FISCAL_CANCELLATION';--> statement-breakpoint
CREATE TABLE "supplier_product_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_document" varchar(14) NOT NULL,
	"supplier_product_code" varchar(180) NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "discount_cents" bigint;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "freight_cents" bigint;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "insurance_cents" bigint;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "other_cents" bigint;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "stock_unit_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "stock_imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "stock_reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD COLUMN "stock_import_error" text;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "fiscal_invoice_item_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_product_mappings" ADD CONSTRAINT "supplier_product_mappings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_product_mappings_supplier_code_uidx" ON "supplier_product_mappings" USING btree ("supplier_document","supplier_product_code");--> statement-breakpoint
CREATE INDEX "supplier_product_mappings_product_idx" ON "supplier_product_mappings" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD CONSTRAINT "fiscal_invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fiscal_invoice_item_id_fiscal_invoice_items_id_fk" FOREIGN KEY ("fiscal_invoice_item_id") REFERENCES "public"."fiscal_invoice_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fiscal_invoice_items_product_idx" ON "fiscal_invoice_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_movements_fiscal_item_idx" ON "stock_movements" USING btree ("fiscal_invoice_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_fiscal_item_type_uidx" ON "stock_movements" USING btree ("fiscal_invoice_item_id","type");