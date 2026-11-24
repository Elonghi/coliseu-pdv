import { readFile } from "node:fs/promises";
import path from "node:path";
import { errorResponse } from "@/lib/errors";
import { permissions } from "@/modules/auth/permissions";
import { requireApiPermission } from "@/modules/auth/session";

/** Download do agente de impressão para instalar no computador do caixa (o arquivo não tem segredo; o token fica no config.json). */
export async function GET() {
  try {
    await requireApiPermission(permissions.CASH_MANAGE);
    const script = await readFile(path.join(process.cwd(), "agent", "coliseu-print-agent.mjs"));
    return new Response(script, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Content-Disposition": "attachment; filename=\"coliseu-print-agent.mjs\"", "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
