DROP INDEX "products_account_sku_uidx";--> statement-breakpoint
DROP INDEX "products_account_barcode_uidx";--> statement-breakpoint
DROP INDEX "supplier_product_mappings_account_supplier_code_uidx";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "store_id" SET DEFAULT app_current_store();--> statement-breakpoint
CREATE UNIQUE INDEX "products_scope_sku_uidx" ON "products" USING btree ("account_id",coalesce("store_id", '00000000-0000-0000-0000-000000000000'::uuid),"sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_scope_barcode_uidx" ON "products" USING btree ("account_id",coalesce("store_id", '00000000-0000-0000-0000-000000000000'::uuid),"barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_product_mappings_scope_supplier_code_uidx" ON "supplier_product_mappings" USING btree ("account_id",coalesce("store_id", '00000000-0000-0000-0000-000000000000'::uuid),"supplier_document","supplier_product_code");--> statement-breakpoint
-- Produtos por loja. Cada produto passa a ter uma loja dona (products.store_id); sem loja = compartilhado entre as lojas do lojista.
-- 1) Lojista com uma loja só: todos os produtos são dessa loja. Assim, uma loja criada depois começa com o catálogo vazio.
UPDATE "products" p SET "store_id" = s."id" FROM "stores" s WHERE p."store_id" IS NULL AND s."account_id" = p."account_id" AND (SELECT count(*) FROM "stores" x WHERE x."account_id" = p."account_id") = 1;--> statement-breakpoint
-- 2) Lojista com várias lojas: o produto vai para a loja que o usa, quando é uma só (saldo, movimento, venda, compra, nota, inventário
--    ou vínculo de fornecedor). Se várias lojas já o usam, ou nenhuma, continua compartilhado: nada some de loja que já o utiliza.
WITH uso AS (
  SELECT "product_id" AS pid, "store_id" FROM "product_stock"
  UNION SELECT "product_id", "store_id" FROM "stock_movements"
  UNION SELECT "product_id", "store_id" FROM "sale_items" WHERE "product_id" IS NOT NULL
  UNION SELECT "product_id", "store_id" FROM "purchase_order_items"
  UNION SELECT "product_id", "store_id" FROM "fiscal_invoice_items" WHERE "product_id" IS NOT NULL
  UNION SELECT "product_id", "store_id" FROM "inventory_count_items"
  UNION SELECT "product_id", "store_id" FROM "supplier_product_mappings" WHERE "store_id" IS NOT NULL
  UNION SELECT "source_product_id", "store_id" FROM "product_splits"
  UNION SELECT "output_product_id", "store_id" FROM "product_splits"
), unica AS (
  SELECT pid, (array_agg("store_id"))[1] AS "store_id" FROM uso WHERE "store_id" IS NOT NULL GROUP BY pid HAVING count(DISTINCT "store_id") = 1
)
UPDATE "products" p SET "store_id" = unica."store_id" FROM unica JOIN "stores" s ON s."id" = unica."store_id" WHERE p."id" = unica.pid AND p."store_id" IS NULL AND s."account_id" = p."account_id";--> statement-breakpoint
-- 3) O vínculo fornecedor-produto acompanha a loja do produto.
UPDATE "supplier_product_mappings" m SET "store_id" = p."store_id" FROM "products" p WHERE p."id" = m."product_id" AND m."store_id" IS NULL AND p."store_id" IS NOT NULL;--> statement-breakpoint
-- 4) Produto compartilhado e produto de uma loja não podem ter o mesmo SKU ou código de barras: a loja enxergaria os dois.
--    (A unicidade entre produtos do mesmo escopo já vem dos índices acima.) SECURITY DEFINER para enxergar os produtos de todas as lojas.
CREATE FUNCTION "products_scope_conflict"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "products" p
    WHERE p."account_id" = NEW."account_id" AND p."id" <> NEW."id"
      AND p."store_id" IS DISTINCT FROM NEW."store_id" AND (p."store_id" IS NULL OR NEW."store_id" IS NULL)
      AND (p."sku" = NEW."sku" OR (NEW."barcode" IS NOT NULL AND p."barcode" = NEW."barcode"))
  ) THEN
    RAISE EXCEPTION 'SKU ou código de barras já usado por um produto compartilhado ou de outra loja' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "products_scope_conflict" BEFORE INSERT OR UPDATE OF "sku","barcode","store_id","account_id" ON "products" FOR EACH ROW EXECUTE FUNCTION "products_scope_conflict"();--> statement-breakpoint
-- 5) Quem usa um produto (venda, estoque, compra, nota, inventário, abertura de box) tem de ser da mesma loja dele.
CREATE TRIGGER "product_stock_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_id" ON "product_stock" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','product_id');--> statement-breakpoint
CREATE TRIGGER "stock_movements_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_id" ON "stock_movements" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','product_id');--> statement-breakpoint
CREATE TRIGGER "sale_items_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_id" ON "sale_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','product_id');--> statement-breakpoint
CREATE TRIGGER "purchase_order_items_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_id" ON "purchase_order_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','product_id');--> statement-breakpoint
CREATE TRIGGER "fiscal_invoice_items_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_id" ON "fiscal_invoice_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','product_id');--> statement-breakpoint
CREATE TRIGGER "inventory_count_items_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_id" ON "inventory_count_items" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','product_id');--> statement-breakpoint
CREATE TRIGGER "supplier_product_mappings_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","product_id" ON "supplier_product_mappings" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','product_id');--> statement-breakpoint
CREATE TRIGGER "product_splits_source_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","source_product_id" ON "product_splits" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','source_product_id');--> statement-breakpoint
CREATE TRIGGER "product_splits_output_product_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","output_product_id" ON "product_splits" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('products','output_product_id');
