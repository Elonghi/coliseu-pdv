CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"cnpj" varchar(14),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_cnpj_format" CHECK ("stores"."cnpj" IS NULL OR "stores"."cnpj" ~ '^[A-Z0-9]{14}$')
);
--> statement-breakpoint
CREATE TABLE "user_stores" (
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_account_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_account_name_lower_uidx" ON "stores" USING btree ("account_id",lower("name"));--> statement-breakpoint
CREATE INDEX "stores_account_idx" ON "stores" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_stores_user_store_uidx" ON "user_stores" USING btree ("user_id","store_id");--> statement-breakpoint
CREATE INDEX "user_stores_store_idx" ON "user_stores" USING btree ("store_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_account_idx" ON "users" USING btree ("account_id");--> statement-breakpoint
-- Dados: a operação que já existe vira a conta de um proprietário, com a loja "Coliseu TCG".
INSERT INTO "accounts" ("name") SELECT 'Coliseu TCG' WHERE EXISTS (SELECT 1 FROM "users") AND NOT EXISTS (SELECT 1 FROM "accounts");--> statement-breakpoint
INSERT INTO "stores" ("account_id","name") SELECT a."id",'Coliseu TCG' FROM "accounts" a WHERE NOT EXISTS (SELECT 1 FROM "stores");--> statement-breakpoint
UPDATE "users" SET "account_id"=(SELECT "id" FROM "accounts" ORDER BY "created_at","id" LIMIT 1) WHERE "account_id" IS NULL AND EXISTS (SELECT 1 FROM "accounts");--> statement-breakpoint
UPDATE "users" SET "is_account_owner"=true WHERE "id"=(SELECT "id" FROM "users" WHERE "role"='ADMIN' AND "account_id" IS NOT NULL ORDER BY "active" DESC,"created_at","id" LIMIT 1) AND NOT EXISTS (SELECT 1 FROM "users" WHERE "is_account_owner");--> statement-breakpoint
INSERT INTO "user_stores" ("user_id","store_id") SELECT u."id",s."id" FROM "users" u JOIN "stores" s ON s."account_id"=u."account_id" ON CONFLICT DO NOTHING;
