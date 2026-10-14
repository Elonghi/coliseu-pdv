CREATE TABLE "fiscal_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_state_id" uuid NOT NULL,
	"imported_by_id" uuid,
	"file_count" integer NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"results" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_import_batches_counts_valid" CHECK ("fiscal_import_batches"."file_count" > 0 AND "fiscal_import_batches"."imported_count" >= 0 AND "fiscal_import_batches"."duplicate_count" >= 0 AND "fiscal_import_batches"."failed_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" DROP CONSTRAINT "fiscal_dfe_documents_nsu_format";--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ALTER COLUMN "nsu" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ADD COLUMN "original_file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "fiscal_import_batches" ADD CONSTRAINT "fiscal_import_batches_sync_state_id_sefaz_sync_states_id_fk" FOREIGN KEY ("sync_state_id") REFERENCES "public"."sefaz_sync_states"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_import_batches" ADD CONSTRAINT "fiscal_import_batches_imported_by_id_users_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fiscal_import_batches_created_idx" ON "fiscal_import_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fiscal_import_batches_state_idx" ON "fiscal_import_batches" USING btree ("sync_state_id");--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ADD CONSTRAINT "fiscal_dfe_documents_import_batch_id_fiscal_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."fiscal_import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_dfe_documents_state_hash_uidx" ON "fiscal_dfe_documents" USING btree ("sync_state_id","content_hash") WHERE "fiscal_dfe_documents"."content_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "fiscal_dfe_documents_import_batch_idx" ON "fiscal_dfe_documents" USING btree ("import_batch_id");--> statement-breakpoint
ALTER TABLE "fiscal_dfe_documents" ADD CONSTRAINT "fiscal_dfe_documents_nsu_format" CHECK ("fiscal_dfe_documents"."nsu" IS NULL OR "fiscal_dfe_documents"."nsu" ~ '^[0-9]{15}$');