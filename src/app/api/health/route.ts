import { pool } from "@/db";
import { access, statfs } from "node:fs/promises";
import { constants } from "node:fs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storagePath=process.env.STORAGE_PATH??"./storage";
    const [sefaz,disk]=await Promise.all([pool.query<{last_error:string|null;last_synced_at:Date|null}>("SELECT last_error,last_synced_at FROM sefaz_sync_states ORDER BY updated_at DESC LIMIT 1"),statfs(storagePath)]);
    await access(storagePath,constants.W_OK);
    const freePercent=Math.round(disk.bavail*100/disk.blocks);
    const minimum=Number(process.env.HEALTH_MIN_STORAGE_FREE_PERCENT??10);
    const storageStatus=freePercent<minimum?"low":"ok";
    const sefazEnabled=process.env.SEFAZ_ENABLED?.toLowerCase()==="true";
    const lastError=sefaz.rows[0]?.last_error??null;
    const status=storageStatus==="low"?"degraded":"ok";
    return Response.json({ status, database: "ok", storage:{status:storageStatus,freePercent},sefaz:{status:sefazEnabled?(lastError?"error":"ok"):"disabled",lastError,lastSyncedAt:sefaz.rows[0]?.last_synced_at??null}, timestamp: new Date().toISOString() }, {
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
