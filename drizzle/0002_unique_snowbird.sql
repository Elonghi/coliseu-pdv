CREATE TYPE "public"."fiscal_document_kind" AS ENUM('SUMMARY', 'NFE', 'EVENT', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."fiscal_invoice_status" AS ENUM('AUTHORIZED', 'CANCELED', 'DENIED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."sefaz_environment" AS ENUM('PRODUCTION', 'HOMOLOGATION');--> statement-breakpoint
CREATE TABLE "fiscal_dfe_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_state_id" uuid NOT NULL,
	"nsu" varchar(15) NOT NULL,
	"schema" varchar(120) NOT NULL,
	"kind" "fiscal_document_kind" DEFAULT 'UNKNOWN' NOT NULL,
	"access_key" varchar(44),
	"raw_xml" text NOT NULL,
	"parsed" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_dfe_documents_nsu_format" CHECK ("fiscal_dfe_documents"."nsu" ~ '^[0-9]{15}$')
);
--> statement-breakpoint
CREATE TABLE "fiscal_invoice_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"invoice_id" uuid,
	"access_key" varchar(44),
	"event_type" varchar(12),
	"sequence" integer,
	"event_at" timestamp with time zone,
	"protocol" varchar(30),
	"status_code" varchar(4),
	"status_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"item_number" integer NOT NULL,
	"product_code" varchar(80),
	"ean" varchar(30),
	"description" varchar(240) NOT NULL,
	"ncm" varchar(12),
	"cfop" varchar(6),
	"unit" varchar(12),
	"quantity" numeric(18, 4),
	"unit_value_cents" bigint,
	"total_cents" bigint,
	"taxes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_state_id" uuid NOT NULL,
	"source_document_id" uuid,
	"access_key" varchar(44) NOT NULL,
	"has_full_xml" boolean DEFAULT false NOT NULL,
	"status" "fiscal_invoice_status" DEFAULT 'UNKNOWN' NOT NULL,
	"issuer_cnpj_cpf" varchar(14),
	"issuer_name" varchar(180),
	"issuer_state_registration" varchar(30),
	"recipient_cnpj_cpf" varchar(14),
	"recipient_name" varchar(180),
	"recipient_state_registration" varchar(30),
	"issue_at" timestamp with time zone,
	"authorization_at" timestamp with time zone,
	"operation_type" integer,
	"model" varchar(3),
	"series" varchar(6),
	"number" varchar(12),
	"operation_nature" varchar(180),
	"total_cents" bigint,
	"protocol" varchar(30),
	"manifestation_status" varchar(40),
	"xml_version" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sefaz_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_cnpj" varchar(14) NOT NULL,
	"environment" "sefaz_environment" NOT NULL,
	"uf_code" integer NOT NULL,
	"last_nsu" varchar(15) DEFAULT '000000000000000' NOT NULL,
	"max_nsu" varchar(15) DEFAULT '000000000000000' NOT NULL,
	"last_status_code" varchar(4),
	"last_status_message" text,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sefaz_sync_states_nsu_format" CHECK ("sefaz_sync_states"."last_nsu" ~ '^[0-9]{15}$' AND "sefaz_sync_states"."max_nsu" ~ '^[0-9]{15}$')
);
--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ADD CONSTRAINT "fiscal_dfe_documents_sync_state_id_sefaz_sync_states_id_fk" FOREIGN KEY ("sync_state_id") REFERENCES "public"."sefaz_sync_states"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_events" ADD CONSTRAINT "fiscal_invoice_events_source_document_id_fiscal_dfe_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."fiscal_dfe_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_events" ADD CONSTRAINT "fiscal_invoice_events_invoice_id_fiscal_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fiscal_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_invoice_items" ADD CONSTRAINT "fiscal_invoice_items_invoice_id_fiscal_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fiscal_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_sync_state_id_sefaz_sync_states_id_fk" FOREIGN KEY ("sync_state_id") REFERENCES "public"."sefaz_sync_states"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_source_document_id_fiscal_dfe_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."fiscal_dfe_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_dfe_documents_state_nsu_uidx" ON "fiscal_dfe_documents" USING btree ("sync_state_id","nsu");--> statement-breakpoint
CREATE INDEX "fiscal_dfe_documents_access_key_idx" ON "fiscal_dfe_documents" USING btree ("access_key");--> statement-breakpoint
CREATE INDEX "fiscal_dfe_documents_received_idx" ON "fiscal_dfe_documents" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_invoice_events_source_uidx" ON "fiscal_invoice_events" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "fiscal_invoice_events_access_key_idx" ON "fiscal_invoice_events" USING btree ("access_key");--> statement-breakpoint
CREATE INDEX "fiscal_invoice_events_invoice_idx" ON "fiscal_invoice_events" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_invoice_items_invoice_number_uidx" ON "fiscal_invoice_items" USING btree ("invoice_id","item_number");--> statement-breakpoint
CREATE INDEX "fiscal_invoice_items_invoice_idx" ON "fiscal_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_invoices_state_access_key_uidx" ON "fiscal_invoices" USING btree ("sync_state_id","access_key");--> statement-breakpoint
CREATE INDEX "fiscal_invoices_issue_idx" ON "fiscal_invoices" USING btree ("issue_at");--> statement-breakpoint
CREATE INDEX "fiscal_invoices_issuer_idx" ON "fiscal_invoices" USING btree ("issuer_cnpj_cpf");--> statement-breakpoint
CREATE INDEX "fiscal_invoices_status_idx" ON "fiscal_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fiscal_invoices_number_idx" ON "fiscal_invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "sefaz_sync_states_company_environment_uidx" ON "sefaz_sync_states" USING btree ("company_cnpj","environment");--> statement-breakpoint
CREATE INDEX "sefaz_sync_states_next_sync_idx" ON "sefaz_sync_states" USING btree ("next_sync_at");