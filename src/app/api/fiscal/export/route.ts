import { z } from "zod";
import { pool } from "@/db";
import { permissions } from "@/modules/auth/permissions";
import { requireApiPermission } from "@/modules/auth/session";
import { sefazPublicConfig } from "@/modules/fiscal/config";
import { buildAccountingZip, type AccountingInvoice } from "@/modules/fiscal/accounting-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  direction: z.enum(["ALL", "ENTRY", "EXIT"]).default("ALL"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  await requireApiPermission(permissions.FISCAL_MANAGE);
  const url = new URL(request.url);
  const parsed = paramsSchema.safeParse({ direction: url.searchParams.get("direction") || "ALL", from: url.searchParams.get("from") || undefined, to: url.searchParams.get("to") || undefined });
  if (!parsed.success) return Response.json({ error: "Filtros de exportação inválidos." }, { status: 400 });
  const config = sefazPublicConfig();
  if (!config.cnpj) return Response.json({ error: "Configure SEFAZ_CNPJ para exportar as notas." }, { status: 503 });
  const values: unknown[] = [];
  const where: string[] = [];
  if (parsed.data.direction === "ENTRY") { values.push(config.cnpj); where.push(`(f.recipient_cnpj_cpf=$${values.length} OR (f.recipient_cnpj_cpf IS NULL AND f.issuer_cnpj_cpf IS DISTINCT FROM $${values.length}))`); }
  if (parsed.data.direction === "EXIT") { values.push(config.cnpj); where.push(`f.issuer_cnpj_cpf=$${values.length}`); }
  if (parsed.data.direction === "ALL") { values.push(config.cnpj); where.push(`(f.recipient_cnpj_cpf=$${values.length} OR f.issuer_cnpj_cpf=$${values.length} OR (f.recipient_cnpj_cpf IS NULL AND f.issuer_cnpj_cpf IS NOT NULL))`); }
  if (parsed.data.from) { values.push(parsed.data.from); where.push(`f.issue_at >= $${values.length}::date`); }
  if (parsed.data.to) { values.push(parsed.data.to); where.push(`f.issue_at < $${values.length}::date + interval '1 day'`); }
  const condition = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query<AccountingInvoice>(`SELECT f.access_key,f.has_full_xml,f.status,f.issue_at,f.model,f.series,f.number,f.total_cents::float8 AS total_cents,f.issuer_name,f.issuer_cnpj_cpf,f.recipient_name,f.recipient_cnpj_cpf,CASE WHEN f.has_full_xml THEN d.raw_xml ELSE NULL END raw_xml FROM fiscal_invoices f LEFT JOIN fiscal_dfe_documents d ON d.id=f.source_document_id ${condition} ORDER BY f.issue_at,f.access_key`, values);
  const { archive } = buildAccountingZip(config.cnpj, result.rows);
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return new Response(archive, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="notas-fiscais-${date}.zip"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
