ALTER TABLE "financial_accounts" ALTER COLUMN "created_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "fiscal_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_installments" ADD COLUMN "source_reference" varchar(60);--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_fiscal_invoice_id_fiscal_invoices_id_fk" FOREIGN KEY ("fiscal_invoice_id") REFERENCES "public"."fiscal_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_fiscal_invoice_uidx" ON "financial_accounts" USING btree ("fiscal_invoice_id");