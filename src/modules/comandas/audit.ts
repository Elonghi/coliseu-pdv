import type { Pool, PoolClient } from "pg";
import type { RequestInfo } from "./request-info";
import type { LocationReading } from "./geo";

/* Auditoria das comandas: uma linha por fato (abertura, escaneamento, pedido, cancelamento, bloqueio...), com quem, quando e de onde.
 * Passados 90 dias, comanda_anonymize_old() apaga o final do IP e a posição exata. O aparelho, o horário e o resultado ficam. */

export const comandaEventTypes = [
  "COMANDA_CREATED", "COMANDA_UPDATED", "COMANDA_QR_ROTATED", "SETTINGS_UPDATED",
  "SESSION_OPENED", "SESSION_CANCELED", "SESSION_CLOSED", "PLAYER_COMPLETED",
  "LINK_OPENED", "LINK_BLOCKED", "ORDER_CREATED", "ORDER_BLOCKED", "COUNTER_ORDER_CREATED",
  "ORDER_DELIVERED", "ORDER_CANCELED", "ITEM_CANCELED",
] as const;
export type ComandaEventType = (typeof comandaEventTypes)[number];

export type ComandaEvent = {
  type: ComandaEventType;
  outcome?: "OK" | "BLOCKED" | "FAILED";
  comandaId?: string | null;
  sessionId?: string | null;
  orderId?: string | null;
  deviceId?: string | null;
  actorUserId?: string | null;
  request?: RequestInfo | null;
  location?: LocationReading | null;
  distanceMeters?: number | null;
  details?: Record<string, unknown>;
};

export async function recordComandaEvent(db: Pick<Pool | PoolClient, "query">, event: ComandaEvent) {
  await db.query(`INSERT INTO comanda_events (comanda_id,session_id,order_id,device_id,actor_user_id,type,outcome,ip,user_agent,device_info,latitude,longitude,accuracy_meters,distance_meters,details)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [
    event.comandaId ?? null, event.sessionId ?? null, event.orderId ?? null, event.deviceId ?? null, event.actorUserId ?? null,
    event.type, event.outcome ?? "OK", event.request?.ip ?? null, event.request?.userAgent ?? null,
    event.request ? JSON.stringify(event.request.deviceInfo) : null,
    event.location?.latitude ?? null, event.location?.longitude ?? null, event.location?.accuracyMeters ?? null, event.distanceMeters ?? null,
    event.details ? JSON.stringify(event.details) : null,
  ]);
}

/** Roda a anonimização (90 dias por padrão). Barata e segura de repetir; qualquer tela do balcão pode chamá-la de vez em quando. */
let lastAnonymizedAt = 0;
export async function anonymizeOldComandaData(db: Pick<Pool, "query">, days = 90) {
  if (Date.now() - lastAnonymizedAt < 3_600_000) return 0;
  lastAnonymizedAt = Date.now();
  const result = await db.query<{ n: number }>("SELECT comanda_anonymize_old($1) AS n", [days]);
  return result.rows[0]?.n ?? 0;
}
