CREATE TYPE "public"."financial_account_type" AS ENUM('PAYABLE', 'RECEIVABLE');--> statement-breakpoint
CREATE TYPE "public"."financial_status" AS ENUM('OPEN', 'PARTIAL', 'SETTLED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."player_credit_movement_type" AS ENUM('MANUAL', 'SALE_CREDIT', 'FUTURE_CHARGE', 'FUTURE_PAYMENT', 'SALE_REVERSAL');--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "financial_account_type" NOT NULL,
	"description" varchar(220) NOT NULL,
	"counterparty_name" varchar(180) NOT NULL,
	"player_id" uuid,
	"sale_id" integer,
	"issue_date" date NOT NULL,
	"total_cents" integer NOT NULL,
	"status" "financial_status" DEFAULT 'OPEN' NOT NULL,
	"notes" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_accounts_total_positive" CHECK ("financial_accounts"."total_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "financial_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"settled_cents" integer DEFAULT 0 NOT NULL,
	"status" "financial_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_installments_values_valid" CHECK ("financial_installments"."installment_number" > 0 AND "financial_installments"."amount_cents" > 0 AND "financial_installments"."settled_cents" >= 0 AND "financial_installments"."settled_cents" <= "financial_installments"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "financial_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method_code" varchar(30) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"person_name" varchar(180),
	"notes" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_settlements_amount_positive" CHECK ("financial_settlements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "player_credit_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"type" "player_credit_movement_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"balance_after_cents" integer NOT NULL,
	"sale_id" integer,
	"financial_account_id" uuid,
	"user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_credit_movements_nonzero" CHECK ("player_credit_movements"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(255),
	"phone" varchar(40),
	"notes" text,
	"credit_balance_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "player_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_installments" ADD CONSTRAINT "financial_installments_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_installment_id_financial_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."financial_installments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_method_code_payment_methods_code_fk" FOREIGN KEY ("method_code") REFERENCES "public"."payment_methods"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_credit_movements" ADD CONSTRAINT "player_credit_movements_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_credit_movements" ADD CONSTRAINT "player_credit_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_credit_movements" ADD CONSTRAINT "player_credit_movements_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_credit_movements" ADD CONSTRAINT "player_credit_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_accounts_type_status_idx" ON "financial_accounts" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "financial_accounts_sale_idx" ON "financial_accounts" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_player_idx" ON "financial_accounts" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_created_idx" ON "financial_accounts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_installments_account_number_uidx" ON "financial_installments" USING btree ("account_id","installment_number");--> statement-breakpoint
CREATE INDEX "financial_installments_due_status_idx" ON "financial_installments" USING btree ("due_date","status");--> statement-breakpoint
CREATE INDEX "financial_settlements_installment_idx" ON "financial_settlements" USING btree ("installment_id");--> statement-breakpoint
CREATE INDEX "financial_settlements_occurred_idx" ON "financial_settlements" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "player_credit_movements_player_date_idx" ON "player_credit_movements" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "player_credit_movements_sale_idx" ON "player_credit_movements" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "player_credit_movements_account_idx" ON "player_credit_movements" USING btree ("financial_account_id");--> statement-breakpoint
CREATE INDEX "players_name_idx" ON "players" USING btree ("name");--> statement-breakpoint
CREATE INDEX "players_active_idx" ON "players" USING btree ("active");--> statement-breakpoint
CREATE INDEX "players_email_idx" ON "players" USING btree ("email");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_player_idx" ON "payments" USING btree ("player_id");
--> statement-breakpoint
INSERT INTO "payment_methods" ("code","name","active","sort_order") VALUES
  ('PLAYER_CREDIT','Crédito do jogador',true,4),
  ('FUTURE','Pagamento futuro',true,5)
ON CONFLICT ("code") DO UPDATE SET "name"=excluded."name","sort_order"=excluded."sort_order","updated_at"=now();
