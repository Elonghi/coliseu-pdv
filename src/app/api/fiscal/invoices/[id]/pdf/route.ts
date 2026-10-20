import { pool } from "@/db";
import { permissions } from "@/modules/auth/permissions";
import { requireApiPermission } from "@/modules/auth/session";
import { generateDanfePdf } from "@/modules/fiscal/danfe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApiPermission(permissions.FISCAL_MANAGE);
  const { id } = await params;
  const result = await pool.query<{ number: string | null; access_key: string; raw_xml: string }>(`SELECT f.number,f.access_key,d.raw_xml FROM fiscal_invoices f JOIN fiscal_dfe_documents d ON d.id=f.source_document_id WHERE f.id=$1 AND f.has_full_xml=true`, [id]);
  const invoice = result.rows[0];
  if (!invoice) return Response.json({ error: "O DANFE exige o XML completo da NF-e." }, { status: 404 });
  try {
    const pdf = await generateDanfePdf(invoice.raw_xml);
    const file = (invoice.number || invoice.access_key).replace(/[^a-zA-Z0-9_-]/g, "");
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="DANFE-${file}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o DANFE." }, { status: 422 });
  }
}
