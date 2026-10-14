import { pool } from "@/db";
import { requireApiPermission } from "@/modules/auth/session";
import { permissions } from "@/modules/auth/permissions";

export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  await requireApiPermission(permissions.FISCAL_MANAGE);const {id}=await params;
  const result=await pool.query<{access_key:string;raw_xml:string}>(`SELECT f.access_key,d.raw_xml FROM fiscal_invoices f JOIN fiscal_dfe_documents d ON d.id=f.source_document_id WHERE f.id=$1 AND f.has_full_xml=true`,[id]);
  const document=result.rows[0];if(!document)return Response.json({error:"XML completo não disponível."},{status:404});
  return new Response(document.raw_xml,{headers:{"Content-Type":"application/xml; charset=utf-8","Content-Disposition":`attachment; filename="NFe-${document.access_key}.xml"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
