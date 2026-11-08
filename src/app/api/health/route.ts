import { pool } from "@/db";
import { runWithScope } from "@/db/scope";
import { isolationStatus, migrationStatus } from "@/modules/platform/status";
import { access, statfs } from "node:fs/promises";
import { constants } from "node:fs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storagePath=process.env.STORAGE_PATH??"./storage";
    // O estado da sincronização fiscal é do sistema todo: lido com o escopo da plataforma, que não enxerga dados de lojistas.
    const sefazQuery=runWithScope({accountId:null,storeId:null,storeIds:[],platform:true},()=>pool.query<{last_error:string|null;last_synced_at:Date|null}>("SELECT last_error,last_synced_at FROM sefaz_sync_states ORDER BY updated_at DESC LIMIT 1"));
    const [sefaz,disk]=await Promise.all([sefazQuery,statfs(storagePath)]);
    await access(storagePath,constants.W_OK);
    const freePercent=Math.round(disk.bavail*100/disk.blocks);
    const minimum=Number(process.env.HEALTH_MIN_STORAGE_FREE_PERCENT??10);
    const storageStatus=freePercent<minimum?"low":"ok";
    const sefazEnabled=process.env.SEFAZ_ENABLED?.toLowerCase()==="true";
    const lastError=sefaz.rows[0]?.last_error??null;
    const status=storageStatus==="low"?"degraded":"ok";
    // Informativo: não derruba o health check, para o Coolify não trocar de versão por causa de uma migration pendente.
    const [isolation,migrations]=await Promise.all([isolationStatus().catch(()=>null),migrationStatus().catch(()=>null)]);
    return Response.json({ status, database: "ok", storage:{status:storageStatus,freePercent},sefaz:{status:sefazEnabled?(lastError?"error":"ok"):"disabled",lastError,lastSyncedAt:sefaz.rows[0]?.last_synced_at??null},isolation:isolation?{enforced:isolation.enforced}:"unknown",migrations:migrations?{applied:migrations.applied,expected:migrations.expected,pending:migrations.pending}:"unknown", timestamp: new Date().toISOString() }, {
      status:status==="ok"?200:503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ status: "unavailable", database: "unavailable", storage:"unknown" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
