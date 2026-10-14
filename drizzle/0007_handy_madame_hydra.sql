ALTER TABLE "products" ADD COLUMN "can_split_into_boosters" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "products" SET "can_split_into_boosters"=true WHERE "sku" IN ('MTG-FDN-BOX','MTG-FF-BOX') OR lower("name") LIKE '%booster box%';
