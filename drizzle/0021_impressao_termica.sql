CREATE TYPE "public"."print_job_status" AS ENUM('QUEUED', 'SENT', 'PRINTED', 'FAILED');--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"terminal_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"sale_id" integer,
	"payload" "bytea" NOT NULL,
	"status" "print_job_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"requested_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "print_jobs_kind_valid" CHECK ("print_jobs"."kind" IN ('SALE_RECEIPT','TEST'))
);
--> statement-breakpoint
CREATE TABLE "print_terminals" (
	"store_id" uuid DEFAULT app_current_store() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"columns" integer DEFAULT 48 NOT NULL,
	"code_page" varchar(10) DEFAULT 'CP860' NOT NULL,
	"cut" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"agent_info" varchar(200),
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_terminals_columns_valid" CHECK ("print_terminals"."columns" BETWEEN 24 AND 80),
	CONSTRAINT "print_terminals_code_page_valid" CHECK ("print_terminals"."code_page" IN ('CP860','CP850','WPC1252','ASCII'))
);
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_terminal_id_print_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."print_terminals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_terminals" ADD CONSTRAINT "print_terminals_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_terminals" ADD CONSTRAINT "print_terminals_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "print_jobs_store_idx" ON "print_jobs" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "print_jobs_terminal_queue_idx" ON "print_jobs" USING btree ("terminal_id","status","created_at");--> statement-breakpoint
CREATE INDEX "print_jobs_sale_idx" ON "print_jobs" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "print_terminals_store_idx" ON "print_terminals" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "print_terminals_store_name_lower_uidx" ON "print_terminals" USING btree ("store_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "print_terminals_token_hash_uidx" ON "print_terminals" USING btree ("token_hash");--> statement-breakpoint
-- Isolamento por loja (mesmo padrão da 0018): sem escopo de loja, nada aparece; o agente de impressão entra no escopo da
-- própria loja antes de conferir o token.
ALTER TABLE "print_terminals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "print_terminals" USING ("store_id" = ANY(app_scope_stores())) WITH CHECK ("store_id" = ANY(app_scope_stores()));--> statement-breakpoint
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "print_jobs" USING ("store_id" = ANY(app_scope_stores())) WITH CHECK ("store_id" = ANY(app_scope_stores()));--> statement-breakpoint
CREATE TRIGGER "print_jobs_terminal_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","terminal_id" ON "print_jobs" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('print_terminals','terminal_id');--> statement-breakpoint
CREATE TRIGGER "print_jobs_sale_id_same_store" BEFORE INSERT OR UPDATE OF "store_id","sale_id" ON "print_jobs" FOR EACH ROW EXECUTE FUNCTION "enforce_same_store"('sales','sale_id');
