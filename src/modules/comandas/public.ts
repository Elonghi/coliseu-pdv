import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { pool } from "@/db";
import { rawPool } from "@/db/raw";
import { runWithScope, type DbScope } from "@/db/scope";
import { AppError } from "@/lib/errors";
import { requireSameOrigin, shouldUseSecureSessionCookie } from "@/lib/security";
import { requireActiveStore } from "@/modules/stock/ledger";
import { recordComandaEvent, type ComandaEventType } from "./audit";
import { evaluateLocation, type LocationInput, type LocationVerdict } from "./geo";
import { hashKey, hit } from "./rate-limit";
import { clientDeviceSchema, requestInfo, type RequestInfo } from "./request-info";
import { getComandaSettings, insertOrder, priceOrderItems } from "./service";
import { parseComandaToken, verifyComandaToken } from "./token";

/* Parte pública das comandas: o que o cliente faz depois de escanear o QR. Ninguém está logado, então tudo parte do link assinado:
 * a assinatura é conferida (token.ts), o escopo da loja é aberto a partir dela e só então o banco é consultado, já sob as travas
 * da loja. Em cada passo vale: limite de tentativas, comanda aberta pelo balcão, celular dentro do raio da loja, preço e estoque
 * conferidos no servidor e um registro na auditoria (com IP, aparelho e posição). */

export type PublicComanda = { comandaId: string; storeId: string; accountId: string; number: number; storeName: string; scope: DbScope };
type Resolved = { ok: true; comanda: PublicComanda } | { ok: false; reason: "INVALID" | "UNAVAILABLE" };

export async function resolveComanda(token: string): Promise<Resolved> {
  const parsed = parseComandaToken(token);
  if (!parsed) return { ok: false, reason: "INVALID" };
  const row = (await rawPool.query<{ comanda_id: string; store_id: string; account_id: string; number: number; active: boolean; token_version: number; store_name: string; store_active: boolean; account_active: boolean }>(
    "SELECT * FROM comanda_public_lookup($1)", [parsed.comandaId])).rows[0];
  // Link adulterado e comanda inexistente dão a mesma resposta: não se descobre quais comandas existem.
  if (!row || !verifyComandaToken(parsed, row.token_version)) return { ok: false, reason: "INVALID" };
  if (!row.active || !row.store_active || !row.account_active) return { ok: false, reason: "UNAVAILABLE" };
  return { ok: true, comanda: { comandaId: row.comanda_id, storeId: row.store_id, accountId: row.account_id, number: row.number, storeName: row.store_name, scope: { accountId: row.account_id, storeId: row.store_id, storeIds: [row.store_id] } } };
}

const tooMany = () => new AppError("Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.", 429, "RATE_LIMITED");

/** Porta de entrada de toda chamada pública: limite por IP, assinatura do link e comanda disponível. */
export async function guard(headers: Headers, token: string) {
  const info = requestInfo(headers);
  const ip = info.ip ?? "desconhecido";
  if (!(await hit(hashKey("pub", ip), 120, 60)).allowed) throw tooMany();
  const resolved = await resolveComanda(token);
  if (!resolved.ok) {
    if (resolved.reason === "INVALID") {
      if (!(await hit(hashKey("bad", ip), 15, 600)).allowed) throw tooMany();
      throw new AppError("Link inválido. Escaneie o QR Code da comanda de novo.", 404, "INVALID_LINK");
    }
    throw new AppError("Esta comanda não está disponível.", 404, "UNAVAILABLE");
  }
  return resolved.comanda;
}

/* ------------------------------------------------------------------ cookie do aparelho */

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const cookieName = (comandaId: string) => `cmd_${comandaId.replace(/-/g, "").slice(0, 12)}`;

async function readSecret(comandaId: string) {
  const value = (await cookies()).get(cookieName(comandaId))?.value;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
async function writeSecret(comandaId: string, secret: string) {
  (await cookies()).set(cookieName(comandaId), secret, { httpOnly: true, secure: shouldUseSecureSessionCookie(), sameSite: "lax", path: "/", maxAge: 12 * 3600 });
}

/* ------------------------------------------------------------------ consultas (sempre dentro do escopo da loja) */

async function currentSession(comandaId: string) {
  return (await pool.query<{ id: string; first_name: string }>(`SELECT s.id,split_part(p.name,' ',1) first_name FROM comanda_sessions s JOIN players p ON p.id=s.player_id
    WHERE s.comanda_id=$1 AND s.status='OPEN'`, [comandaId])).rows[0] ?? null;
}

async function deviceOf(comandaId: string, sessionId: string) {
  const secret = await readSecret(comandaId);
  if (!secret) return null;
  return (await pool.query<{ id: string }>("SELECT id FROM comanda_devices WHERE session_id=$1 AND secret_hash=$2", [sessionId, sha(secret)])).rows[0]?.id ?? null;
}

export type MenuItem = { id: string; name: string; priceCents: number; category: string; maxQuantity: number };

export async function loadMenu(): Promise<MenuItem[]> {
  const rows = (await pool.query<{ id: string; name: string; sale_price_cents: number; category: string; available: number }>(`SELECT p.id,p.name,p.sale_price_cents,c.name category,
      GREATEST(COALESCE(ps.quantity,0) - COALESCE((SELECT sum(i.quantity) FROM comanda_order_items i JOIN comanda_orders o ON o.id=i.order_id JOIN comanda_sessions s ON s.id=o.session_id
        WHERE i.product_id=p.id AND i.canceled_at IS NULL AND s.status='OPEN'),0),0)::int available
    FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.store_id=app_current_store()
    WHERE p.active AND p.available_on_comanda AND (p.store_id IS NULL OR p.store_id=app_current_store()) ORDER BY c.name,p.name`)).rows;
  return rows.map((row) => ({ id: row.id, name: row.name, priceCents: row.sale_price_cents, category: row.category, maxQuantity: Math.min(row.available, 10) }));
}

export type AccountItem = { name: string; quantity: number; unitPriceCents: number; canceled: boolean };
export type AccountOrder = { id: string; status: "NEW" | "DELIVERED" | "CANCELED"; createdAt: string; items: AccountItem[] };
export type Account = { orders: AccountOrder[]; totalCents: number };

export async function loadAccount(sessionId: string): Promise<Account> {
  const orders = (await pool.query<{ id: string; status: AccountOrder["status"]; created_at: Date }>("SELECT id,status,created_at FROM comanda_orders WHERE session_id=$1 ORDER BY created_at", [sessionId])).rows;
  const items = (await pool.query<{ order_id: string; product_name: string; quantity: number; unit_price_cents: number; canceled_at: Date | null }>(`SELECT i.order_id,i.product_name,i.quantity,i.unit_price_cents,i.canceled_at
    FROM comanda_order_items i JOIN comanda_orders o ON o.id=i.order_id WHERE o.session_id=$1 ORDER BY i.product_name`, [sessionId])).rows;
  const byOrder = new Map<string, AccountItem[]>();
  for (const item of items) byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), { name: item.product_name, quantity: item.quantity, unitPriceCents: item.unit_price_cents, canceled: Boolean(item.canceled_at) }]);
  return {
    orders: orders.map((order) => ({ id: order.id, status: order.status, createdAt: order.created_at.toISOString(), items: byOrder.get(order.id) ?? [] })),
    totalCents: items.filter((item) => !item.canceled_at).reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0),
  };
}

/* ------------------------------------------------------------------ entradas da tela pública */

const locationSchema = z.union([
  z.object({ denied: z.literal(true) }),
  z.object({ latitude: z.number(), longitude: z.number(), accuracyMeters: z.number().nullish() }),
]);
const withDevice = { location: locationSchema.nullish(), device: clientDeviceSchema.nullish() };
const enterSchema = z.object(withDevice);
const orderSchema = z.object({
  ...withDevice,
  requestId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10) })).min(1, "Escolha ao menos um item.").max(20),
  note: z.string().trim().max(200).optional(),
});

async function block(comanda: PublicComanda, type: ComandaEventType, request: RequestInfo, reason: string, extra: { sessionId?: string | null; deviceId?: string | null; verdict?: LocationVerdict } = {}) {
  await recordComandaEvent(pool, {
    type, outcome: "BLOCKED", comandaId: comanda.comandaId, sessionId: extra.sessionId, deviceId: extra.deviceId, request,
    location: extra.verdict?.reading, distanceMeters: extra.verdict?.distanceMeters, details: { reason },
  }).catch((error) => console.error("[comanda] falha ao registrar bloqueio", error));
}

/** O que a página mostra antes de o cliente tocar em qualquer coisa: se a comanda está aberta e de qual loja ela é. */
export async function describeForPage(token: string, headers: Headers) {
  let comanda: PublicComanda;
  try { comanda = await guard(headers, token); } catch (error) { return { kind: error instanceof AppError && error.status === 429 ? "busy" as const : "invalid" as const }; }
  return runWithScope(comanda.scope, async () => {
    const settings = await getComandaSettings();
    const base = { storeName: comanda.storeName, number: comanda.number };
    if (!settings.enabled) { await block(comanda, "LINK_BLOCKED", requestInfo(headers), "DISABLED"); return { kind: "disabled" as const, ...base }; }
    const session = await currentSession(comanda.comandaId);
    if (!session) { await block(comanda, "LINK_BLOCKED", requestInfo(headers), "CLOSED"); return { kind: "closed" as const, ...base }; }
    return { kind: "open" as const, ...base, requireLocation: settings.requireLocation };
  });
}

export async function enterComanda(comanda: PublicComanda, headers: Headers, body: unknown) {
  return runWithScope(comanda.scope, async () => {
    const parsed = enterSchema.parse(body);
    const info = requestInfo(headers, parsed.device);
    const settings = await getComandaSettings();
    if (!settings.enabled) { await block(comanda, "LINK_BLOCKED", info, "DISABLED"); throw new AppError("Os pedidos pela comanda ainda não estão ativos nesta loja.", 403, "DISABLED"); }
    const session = await currentSession(comanda.comandaId);
    if (!session) { await block(comanda, "LINK_BLOCKED", info, "CLOSED"); throw new AppError("Esta comanda está fechada. Peça ao atendente para abri-la.", 409, "CLOSED"); }
    const verdict = evaluateLocation(settings, parsed.location as LocationInput);
    if (!verdict.ok) { await block(comanda, "LINK_BLOCKED", info, verdict.code, { sessionId: session.id, verdict }); throw new AppError(verdict.message, 403, verdict.code); }

    let deviceId = await deviceOf(comanda.comandaId, session.id);
    if (deviceId) {
      await pool.query("UPDATE comanda_devices SET last_seen_at=now(),ip=$2,user_agent=$3,device_info=$4 WHERE id=$1", [deviceId, info.ip, info.userAgent, JSON.stringify(info.deviceInfo)]);
    } else {
      const secret = randomBytes(32).toString("base64url");
      deviceId = (await pool.query<{ id: string }>("INSERT INTO comanda_devices (session_id,secret_hash,ip,user_agent,device_info) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [session.id, sha(secret), info.ip, info.userAgent, JSON.stringify(info.deviceInfo)])).rows[0].id;
      await writeSecret(comanda.comandaId, secret);
    }
    await recordComandaEvent(pool, { type: "LINK_OPENED", comandaId: comanda.comandaId, sessionId: session.id, deviceId, request: info, location: verdict.reading, distanceMeters: verdict.distanceMeters });
    return { store: comanda.storeName, number: comanda.number, playerFirstName: session.first_name, menu: await loadMenu(), account: await loadAccount(session.id) };
  });
}

export async function createCustomerOrder(comanda: PublicComanda, headers: Headers, body: unknown) {
  return runWithScope(comanda.scope, async () => {
    const parsed = orderSchema.parse(body);
    const info = requestInfo(headers, parsed.device);
    const settings = await getComandaSettings();
    if (!settings.enabled) { await block(comanda, "ORDER_BLOCKED", info, "DISABLED"); throw new AppError("Os pedidos pela comanda ainda não estão ativos nesta loja.", 403, "DISABLED"); }
    const session = await currentSession(comanda.comandaId);
    if (!session) { await block(comanda, "ORDER_BLOCKED", info, "CLOSED"); throw new AppError("Esta comanda foi fechada. Peça ao atendente para abri-la de novo.", 409, "CLOSED"); }
    const deviceId = await deviceOf(comanda.comandaId, session.id);
    if (!deviceId) { await block(comanda, "ORDER_BLOCKED", info, "NO_DEVICE", { sessionId: session.id }); throw new AppError("Sua sessão expirou. Recarregue a página para continuar.", 401, "NO_DEVICE"); }
    const verdict = evaluateLocation(settings, parsed.location as LocationInput);
    if (!verdict.ok) { await block(comanda, "ORDER_BLOCKED", info, verdict.code, { sessionId: session.id, deviceId, verdict }); throw new AppError(verdict.message, 403, verdict.code); }
    if (parsed.items.reduce((sum, item) => sum + item.quantity, 0) > 30) throw new AppError("Máximo de 30 itens por pedido.", 422, "TOO_MANY_ITEMS");
    if (!(await hit(hashKey("ord", comanda.comandaId), 20, 600)).allowed) { await block(comanda, "ORDER_BLOCKED", info, "RATE_LIMITED", { sessionId: session.id, deviceId }); throw tooMany(); }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await requireActiveStore(client, "registrar o pedido");
      const locked = (await client.query<{ status: string }>("SELECT status FROM comanda_sessions WHERE id=$1 FOR UPDATE", [session.id])).rows[0];
      if (locked?.status !== "OPEN") throw new AppError("Esta comanda foi fechada. Peça ao atendente para abri-la de novo.", 409, "CLOSED");
      const repeated = await client.query<{ id: string }>("SELECT id FROM comanda_orders WHERE session_id=$1 AND request_id=$2", [session.id, parsed.requestId]);
      if (!repeated.rowCount) {
        const lines = await priceOrderItems(client, parsed.items, { onlyOnMenu: true });
        const orderId = await insertOrder(client, { sessionId: session.id, source: "CUSTOMER", lines, deviceId, requestId: parsed.requestId, note: parsed.note });
        await recordComandaEvent(client, {
          type: "ORDER_CREATED", comandaId: comanda.comandaId, sessionId: session.id, orderId, deviceId, request: info, location: verdict.reading, distanceMeters: verdict.distanceMeters,
          details: { lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPriceCents: line.unitPriceCents })), note: parsed.note ?? null },
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) await block(comanda, "ORDER_BLOCKED", info, error.code, { sessionId: session.id, deviceId, verdict });
      throw error;
    } finally {
      client.release();
    }
    return { account: await loadAccount(session.id), menu: await loadMenu() };
  });
}

export async function readCustomerAccount(comanda: PublicComanda) {
  return runWithScope(comanda.scope, async () => {
    const session = await currentSession(comanda.comandaId);
    if (!session) return { state: "CLOSED" as const };
    if (!(await deviceOf(comanda.comandaId, session.id))) throw new AppError("Sua sessão expirou. Recarregue a página para continuar.", 401, "NO_DEVICE");
    return { state: "OPEN" as const, playerFirstName: session.first_name, account: await loadAccount(session.id), menu: await loadMenu() };
  });
}

/** Casca comum das rotas públicas: confere a origem (quando há corpo), abre o escopo da comanda e devolve JSON sem cache. */
export async function handlePublic(request: Request, token: string, run: (comanda: PublicComanda, headers: Headers) => Promise<unknown>) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (request.method !== "GET") requireSameOrigin(request);
    const comanda = await guard(request.headers, token);
    return Response.json(await run(comanda, request.headers), { headers });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Dados inválidos.", code: "VALIDATION_ERROR" }, { status: 422, headers });
    console.error("[comanda] erro inesperado", error);
    return Response.json({ error: "Erro interno. Tente novamente." }, { status: 500, headers });
  }
}

export async function readJsonBody(request: Request) {
  const text = await request.text();
  if (text.length > 8_000) throw new AppError("Requisição grande demais.", 413, "TOO_LARGE");
  try { return text ? JSON.parse(text) : {}; } catch { throw new AppError("Requisição inválida.", 400, "BAD_JSON"); }
}
