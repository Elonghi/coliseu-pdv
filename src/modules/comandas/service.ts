import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { lockProducts, requireActiveStore } from "@/modules/stock/ledger";
import { recordComandaEvent } from "./audit";
import type { StoreLocation } from "./geo";
import type { RequestInfo } from "./request-info";

/* Operação das comandas no balcão (sessão autenticada, escopo da loja ativa). A parte pública do cliente está em ./public.ts. */

type Queryable = Pick<Pool | PoolClient, "query">;

async function inTransaction<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const isUnique = (error: unknown, constraint?: string) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "23505" && (!constraint || (error as { constraint?: string }).constraint === constraint);

/* ------------------------------------------------------------------ configurações da loja */

export async function getComandaSettings(db: Queryable = pool): Promise<StoreLocation> {
  const row = (await db.query<{ enabled: boolean; require_location: boolean; latitude: number | null; longitude: number | null; radius_meters: number }>(
    "SELECT enabled,require_location,latitude,longitude,radius_meters FROM comanda_settings WHERE store_id=app_current_store()")).rows[0];
  return row
    ? { enabled: row.enabled, requireLocation: row.require_location, latitude: row.latitude, longitude: row.longitude, radiusMeters: row.radius_meters }
    : { enabled: false, requireLocation: true, latitude: null, longitude: null, radiusMeters: 150 };
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  requireLocation: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  radiusMeters: z.number().int().min(20, "O raio mínimo é de 20 metros.").max(2000, "O raio máximo é de 2.000 metros."),
});

export async function saveComandaSettings(input: unknown, userId: string) {
  const parsed = settingsSchema.parse(input);
  if ((parsed.latitude === null) !== (parsed.longitude === null)) throw new AppError("Informe latitude e longitude juntas.", 422);
  if (parsed.enabled && parsed.requireLocation && parsed.latitude === null) throw new AppError("Defina a localização da loja antes de ligar as comandas com a conferência de localização.", 422, "LOCATION_REQUIRED");
  await inTransaction(async (client) => {
    await requireActiveStore(client, "configurar as comandas");
    await client.query(`INSERT INTO comanda_settings (enabled,require_location,latitude,longitude,radius_meters) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (store_id) DO UPDATE SET enabled=EXCLUDED.enabled,require_location=EXCLUDED.require_location,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,radius_meters=EXCLUDED.radius_meters,updated_at=now()`,
      [parsed.enabled, parsed.requireLocation, parsed.latitude, parsed.longitude, parsed.radiusMeters]);
    await recordComandaEvent(client, { type: "SETTINGS_UPDATED", actorUserId: userId, details: { enabled: parsed.enabled, requireLocation: parsed.requireLocation, radiusMeters: parsed.radiusMeters, hasLocation: parsed.latitude !== null } });
  });
}

/* ------------------------------------------------------------------ cadastro das comandas */

export type ComandaRow = {
  id: string; number: number; active: boolean; token_version: number;
  session_id: string | null; opened_at: Date | null; player_name: string | null; provisional: boolean | null; total_cents: number; new_orders: number;
};

export async function listComandas() {
  return (await pool.query<ComandaRow>(`SELECT c.id,c.number,c.active,c.token_version,s.id session_id,s.opened_at,p.name player_name,p.provisional,
      COALESCE((SELECT sum(i.unit_price_cents*i.quantity) FROM comanda_order_items i JOIN comanda_orders o ON o.id=i.order_id WHERE o.session_id=s.id AND i.canceled_at IS NULL),0)::int total_cents,
      COALESCE((SELECT count(*) FROM comanda_orders o WHERE o.session_id=s.id AND o.status='NEW' AND o.source='CUSTOMER'),0)::int new_orders
    FROM comandas c LEFT JOIN comanda_sessions s ON s.comanda_id=c.id AND s.status='OPEN' LEFT JOIN players p ON p.id=s.player_id
    ORDER BY c.number`)).rows;
}

const rangeSchema = z.object({ from: z.number().int().min(1).max(9999), to: z.number().int().min(1).max(9999) })
  .refine((value) => value.to >= value.from, "O número final deve ser maior ou igual ao inicial.")
  .refine((value) => value.to - value.from < 200, "Cadastre até 200 comandas por vez.");

export async function createComandas(input: unknown, userId: string) {
  const { from, to } = rangeSchema.parse(input);
  return inTransaction(async (client) => {
    await requireActiveStore(client, "cadastrar comandas");
    const created = await client.query<{ id: string; number: number }>("INSERT INTO comandas (number) SELECT g FROM generate_series($1::int,$2::int) g ON CONFLICT (store_id,number) DO NOTHING RETURNING id,number", [from, to]);
    await recordComandaEvent(client, { type: "COMANDA_CREATED", actorUserId: userId, details: { from, to, created: created.rowCount } });
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'COMANDA_CREATE','comanda',$2,$3)", [userId, `${from}-${to}`, JSON.stringify({ from, to, created: created.rowCount })]);
    return { created: created.rowCount ?? 0, skipped: to - from + 1 - (created.rowCount ?? 0) };
  });
}

export async function updateComanda(id: string, input: { number: number; active: boolean }, userId: string) {
  const parsed = z.object({ number: z.number().int().min(1).max(9999), active: z.boolean() }).parse(input);
  return inTransaction(async (client) => {
    await requireActiveStore(client, "editar comandas");
    const before = (await client.query<{ number: number; active: boolean }>("SELECT number,active FROM comandas WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!before) throw new AppError("Comanda não encontrada.", 404);
    if (!parsed.active) {
      const open = await client.query("SELECT 1 FROM comanda_sessions WHERE comanda_id=$1 AND status='OPEN'", [id]);
      if (open.rowCount) throw new AppError("Esta comanda está aberta. Feche ou cancele a conta antes de desativá-la.", 409, "COMANDA_OPEN");
    }
    try { await client.query("UPDATE comandas SET number=$2,active=$3,updated_at=now() WHERE id=$1", [id, parsed.number, parsed.active]); }
    catch (error) { if (isUnique(error)) throw new AppError(`Já existe a comanda ${parsed.number} nesta loja.`, 409, "DUPLICATE"); throw error; }
    await recordComandaEvent(client, { type: "COMANDA_UPDATED", comandaId: id, actorUserId: userId, details: { before, after: parsed } });
  });
}

/** Invalida o QR impresso da comanda: o link antigo deixa de funcionar e é preciso imprimir o novo. */
export async function rotateComandaQr(id: string, userId: string) {
  return inTransaction(async (client) => {
    await requireActiveStore(client, "trocar o QR da comanda");
    const row = (await client.query<{ number: number }>("UPDATE comandas SET token_version=token_version+1,updated_at=now() WHERE id=$1 RETURNING number", [id])).rows[0];
    if (!row) throw new AppError("Comanda não encontrada.", 404);
    await recordComandaEvent(client, { type: "COMANDA_QR_ROTATED", comandaId: id, actorUserId: userId, details: { number: row.number } });
    return row.number;
  });
}

/* ------------------------------------------------------------------ cardápio do celular */

export type MenuProduct = { id: string; name: string; sku: string; sale_price_cents: number; category: string; available_on_comanda: boolean; stock: number };

export async function listMenuProducts() {
  return (await pool.query<MenuProduct>(`SELECT p.id,p.name,p.sku,p.sale_price_cents,c.name category,p.available_on_comanda,COALESCE(ps.quantity,0)::int stock
    FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.store_id=app_current_store()
    WHERE p.active AND (p.store_id IS NULL OR p.store_id=app_current_store()) ORDER BY c.name,p.name`)).rows;
}

/** Define quais produtos o cliente vê no celular: os marcados entram, os demais saem. Desligado por padrão para todo produto. */
export async function saveComandaMenu(productIds: string[], userId: string) {
  const ids = z.array(z.string().uuid()).max(5000).parse(productIds);
  return inTransaction(async (client) => {
    await requireActiveStore(client, "editar o cardápio das comandas");
    const changed = await client.query(`UPDATE products SET available_on_comanda=(id=ANY($1::uuid[])),updated_at=now()
      WHERE (store_id IS NULL OR store_id=app_current_store()) AND available_on_comanda IS DISTINCT FROM (id=ANY($1::uuid[]))`, [ids]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'COMANDA_MENU_UPDATE','store',$2,$3)", [userId, "cardapio", JSON.stringify({ onMenu: ids.length, changed: changed.rowCount })]);
    return { onMenu: ids.length, changed: changed.rowCount ?? 0 };
  });
}

/* ------------------------------------------------------------------ abertura e conta */

const openSchema = z.object({
  comandaId: z.string().uuid(),
  playerId: z.string().uuid().optional(),
  provisionalName: z.string().trim().min(2, "Informe o nome do cliente (pelo menos 2 letras).").max(160).optional(),
  provisionalPhone: z.string().trim().max(40).optional(),
}).refine((value) => Boolean(value.playerId) !== Boolean(value.provisionalName), "Escolha um jogador cadastrado ou informe o nome para um cadastro provisório.");

export async function openComandaSession(input: unknown, userId: string) {
  const parsed = openSchema.parse(input);
  return inTransaction(async (client) => {
    await requireActiveStore(client, "abrir comandas");
    const comanda = (await client.query<{ number: number; active: boolean }>("SELECT number,active FROM comandas WHERE id=$1 FOR UPDATE", [parsed.comandaId])).rows[0];
    if (!comanda) throw new AppError("Comanda não encontrada.", 404);
    if (!comanda.active) throw new AppError("Esta comanda está desativada.", 409, "COMANDA_INACTIVE");
    let playerId = parsed.playerId;
    let provisional = false;
    if (playerId) {
      const player = await client.query("SELECT 1 FROM players WHERE id=$1 AND active", [playerId]);
      if (!player.rowCount) throw new AppError("Jogador não encontrado ou inativo.", 404);
    } else {
      provisional = true;
      playerId = (await client.query<{ id: string }>("INSERT INTO players (name,phone,notes,provisional) VALUES ($1,$2,$3,true) RETURNING id",
        [parsed.provisionalName, parsed.provisionalPhone || null, `Cadastro provisório criado ao abrir a comanda ${comanda.number}. Complete os dados ao fechar a conta.`])).rows[0].id;
      await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'PLAYER_CREATE','player',$2,$3)", [userId, playerId, JSON.stringify({ name: parsed.provisionalName, provisional: true })]);
    }
    let sessionId: string;
    try {
      sessionId = (await client.query<{ id: string }>("INSERT INTO comanda_sessions (comanda_id,player_id,opened_by_id) VALUES ($1,$2,$3) RETURNING id", [parsed.comandaId, playerId, userId])).rows[0].id;
    } catch (error) {
      if (isUnique(error, "comanda_sessions_one_open_uidx")) throw new AppError("Esta comanda já está aberta.", 409, "ALREADY_OPEN");
      throw error;
    }
    await recordComandaEvent(client, { type: "SESSION_OPENED", comandaId: parsed.comandaId, sessionId, actorUserId: userId, details: { number: comanda.number, playerId, provisional } });
    return { sessionId, playerId, provisional, number: comanda.number };
  });
}

export type SessionItem = { id: string; product_id: string; product_name: string; unit_price_cents: number; quantity: number; canceled_at: Date | null; cancel_reason: string | null };
export type SessionOrder = {
  id: string; source: "CUSTOMER" | "COUNTER"; status: "NEW" | "DELIVERED" | "CANCELED"; note: string | null; created_at: Date; delivered_at: Date | null;
  cancel_reason: string | null; created_by_name: string | null; items: SessionItem[];
};
export type SessionDetail = {
  id: string; status: "OPEN" | "CLOSED" | "CANCELED"; opened_at: Date; closed_at: Date | null; sale_id: number | null; cancel_reason: string | null;
  comanda_id: string; number: number; player_id: string; player_name: string; player_phone: string | null; player_email: string | null; provisional: boolean;
  opened_by_name: string; orders: SessionOrder[]; totalCents: number; newOrders: number;
};

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const session = (await pool.query<Omit<SessionDetail, "orders" | "totalCents" | "newOrders">>(`SELECT s.id,s.status,s.opened_at,s.closed_at,s.sale_id,s.cancel_reason,s.comanda_id,c.number,
      s.player_id,p.name player_name,p.phone player_phone,p.email player_email,p.provisional,u.name opened_by_name
    FROM comanda_sessions s JOIN comandas c ON c.id=s.comanda_id JOIN players p ON p.id=s.player_id JOIN users u ON u.id=s.opened_by_id WHERE s.id=$1`, [sessionId])).rows[0];
  if (!session) return null;
  const orders = (await pool.query<Omit<SessionOrder, "items">>(`SELECT o.id,o.source,o.status,o.note,o.created_at,o.delivered_at,o.cancel_reason,u.name created_by_name
    FROM comanda_orders o LEFT JOIN users u ON u.id=o.created_by_id WHERE o.session_id=$1 ORDER BY o.created_at`, [sessionId])).rows;
  const items = (await pool.query<SessionItem & { order_id: string }>(`SELECT i.id,i.order_id,i.product_id,i.product_name,i.unit_price_cents,i.quantity,i.canceled_at,i.cancel_reason
    FROM comanda_order_items i JOIN comanda_orders o ON o.id=i.order_id WHERE o.session_id=$1 ORDER BY i.product_name`, [sessionId])).rows;
  const byOrder = new Map<string, SessionItem[]>();
  for (const item of items) byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), item]);
  const full = orders.map((order) => ({ ...order, items: byOrder.get(order.id) ?? [] }));
  const totalCents = items.filter((item) => !item.canceled_at).reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
  return { ...session, orders: full, totalCents, newOrders: full.filter((order) => order.status === "NEW" && order.source === "CUSTOMER").length };
}

/** A sessão aberta de uma comanda, se houver. */
export async function openSessionOf(comandaId: string) {
  return (await pool.query<{ id: string }>("SELECT id FROM comanda_sessions WHERE comanda_id=$1 AND status='OPEN'", [comandaId])).rows[0]?.id ?? null;
}

/* ------------------------------------------------------------------ itens: preço, cardápio e estoque */

export type PricedLine = { productId: string; name: string; unitPriceCents: number; quantity: number };

/** Confere e precifica os itens de um pedido. Preço, nome e disponibilidade vêm sempre do servidor, nunca do aparelho do cliente.
 * Estoque disponível = saldo da loja menos o que já está pedido em comandas abertas (a conta só baixa o estoque ao ser cobrada). */
export async function priceOrderItems(client: PoolClient, items: { productId: string; quantity: number }[], options: { onlyOnMenu: boolean }): Promise<PricedLine[]> {
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  const ids = [...merged.keys()];
  await lockProducts(client, ids);
  const rows = (await client.query<{ id: string; name: string; sale_price_cents: number; active: boolean; available_on_comanda: boolean; stock: number; reserved: number }>(`SELECT p.id,p.name,p.sale_price_cents,p.active,p.available_on_comanda,
      COALESCE(ps.quantity,0)::int stock,
      COALESCE((SELECT sum(i.quantity) FROM comanda_order_items i JOIN comanda_orders o ON o.id=i.order_id JOIN comanda_sessions s ON s.id=o.session_id
        WHERE i.product_id=p.id AND i.canceled_at IS NULL AND s.status='OPEN'),0)::int reserved
    FROM products p LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.store_id=app_current_store()
    WHERE p.id=ANY($1::uuid[]) AND (p.store_id IS NULL OR p.store_id=app_current_store())`, [ids])).rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => {
    const product = byId.get(id);
    const quantity = merged.get(id)!;
    if (!product || !product.active || (options.onlyOnMenu && !product.available_on_comanda)) throw new AppError("Um dos itens não está mais disponível. Atualize a página.", 409, "PRODUCT_UNAVAILABLE");
    const available = product.stock - product.reserved;
    if (available < quantity) throw new AppError(available > 0 ? `${product.name}: só restam ${available}.` : `${product.name} está esgotado.`, 409, "INSUFFICIENT_STOCK");
    return { productId: id, name: product.name, unitPriceCents: product.sale_price_cents, quantity };
  });
}

/** Grava o pedido e seus itens na sessão (já travada e conferida por quem chama). */
export async function insertOrder(client: PoolClient, input: {
  sessionId: string; source: "CUSTOMER" | "COUNTER"; lines: PricedLine[]; deviceId?: string | null; userId?: string | null; requestId?: string | null; note?: string | null;
}) {
  const order = (await client.query<{ id: string }>("INSERT INTO comanda_orders (session_id,source,device_id,created_by_id,request_id,status,note,delivered_at,delivered_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [input.sessionId, input.source, input.deviceId ?? null, input.userId ?? null, input.requestId ?? null, input.source === "COUNTER" ? "DELIVERED" : "NEW", input.note || null, input.source === "COUNTER" ? new Date() : null, input.source === "COUNTER" ? input.userId ?? null : null])).rows[0].id;
  for (const line of input.lines) {
    await client.query("INSERT INTO comanda_order_items (order_id,product_id,product_name,unit_price_cents,quantity) VALUES ($1,$2,$3,$4,$5)", [order, line.productId, line.name, line.unitPriceCents, line.quantity]);
  }
  return order;
}

const itemsSchema = z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1, "Escolha ao menos um item.").max(40);

/** O balcão lança itens na comanda (qualquer produto ativo, mesmo fora do cardápio do celular). */
export async function addCounterOrder(sessionId: string, items: unknown, userId: string, note?: string) {
  const parsed = itemsSchema.parse(items);
  return inTransaction(async (client) => {
    await requireActiveStore(client, "lançar itens na comanda");
    const session = (await client.query<{ comanda_id: string; status: string }>("SELECT comanda_id,status FROM comanda_sessions WHERE id=$1 FOR UPDATE", [sessionId])).rows[0];
    if (!session) throw new AppError("Comanda não encontrada.", 404);
    if (session.status !== "OPEN") throw new AppError("Esta comanda já foi encerrada.", 409, "SESSION_CLOSED");
    const lines = await priceOrderItems(client, parsed, { onlyOnMenu: false });
    const orderId = await insertOrder(client, { sessionId, source: "COUNTER", lines, userId, note });
    await recordComandaEvent(client, { type: "COUNTER_ORDER_CREATED", comandaId: session.comanda_id, sessionId, orderId, actorUserId: userId, details: { lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPriceCents: line.unitPriceCents })) } });
    return orderId;
  });
}

/** Trava a sessão e devolve a comanda dela, exigindo que ainda esteja aberta. */
async function lockOpenSessionOfOrder(client: PoolClient, orderId: string) {
  const row = (await client.query<{ session_id: string; comanda_id: string; status: string; order_status: string }>(`SELECT s.id session_id,s.comanda_id,s.status,o.status order_status
    FROM comanda_orders o JOIN comanda_sessions s ON s.id=o.session_id WHERE o.id=$1 FOR UPDATE OF s`, [orderId])).rows[0];
  if (!row) throw new AppError("Pedido não encontrado.", 404);
  if (row.status !== "OPEN") throw new AppError("Esta comanda já foi encerrada.", 409, "SESSION_CLOSED");
  return row;
}

export async function markOrderDelivered(orderId: string, userId: string) {
  return inTransaction(async (client) => {
    await requireActiveStore(client, "atualizar pedidos");
    const row = await lockOpenSessionOfOrder(client, orderId);
    if (row.order_status !== "NEW") return;
    await client.query("UPDATE comanda_orders SET status='DELIVERED',delivered_at=now(),delivered_by_id=$2,updated_at=now() WHERE id=$1", [orderId, userId]);
    await recordComandaEvent(client, { type: "ORDER_DELIVERED", comandaId: row.comanda_id, sessionId: row.session_id, orderId, actorUserId: userId });
  });
}

const reasonSchema = z.string().trim().min(3, "Informe o motivo (pelo menos 3 letras).").max(200);

export async function cancelOrder(orderId: string, reason: string, userId: string) {
  const why = reasonSchema.parse(reason);
  return inTransaction(async (client) => {
    await requireActiveStore(client, "cancelar pedidos");
    const row = await lockOpenSessionOfOrder(client, orderId);
    if (row.order_status === "CANCELED") return;
    await client.query("UPDATE comanda_order_items SET canceled_at=now(),canceled_by_id=$2,cancel_reason=$3 WHERE order_id=$1 AND canceled_at IS NULL", [orderId, userId, why]);
    await client.query("UPDATE comanda_orders SET status='CANCELED',canceled_at=now(),canceled_by_id=$2,cancel_reason=$3,updated_at=now() WHERE id=$1", [orderId, userId, why]);
    await recordComandaEvent(client, { type: "ORDER_CANCELED", comandaId: row.comanda_id, sessionId: row.session_id, orderId, actorUserId: userId, details: { reason: why } });
  });
}

export async function cancelOrderItem(itemId: string, reason: string, userId: string) {
  const why = reasonSchema.parse(reason);
  return inTransaction(async (client) => {
    await requireActiveStore(client, "cancelar itens");
    const item = (await client.query<{ order_id: string; canceled_at: Date | null; product_name: string; quantity: number }>("SELECT order_id,canceled_at,product_name,quantity FROM comanda_order_items WHERE id=$1", [itemId])).rows[0];
    if (!item) throw new AppError("Item não encontrado.", 404);
    const row = await lockOpenSessionOfOrder(client, item.order_id);
    if (item.canceled_at) return;
    await client.query("UPDATE comanda_order_items SET canceled_at=now(),canceled_by_id=$2,cancel_reason=$3 WHERE id=$1", [itemId, userId, why]);
    const remaining = await client.query("SELECT 1 FROM comanda_order_items WHERE order_id=$1 AND canceled_at IS NULL", [item.order_id]);
    if (!remaining.rowCount) await client.query("UPDATE comanda_orders SET status='CANCELED',canceled_at=now(),canceled_by_id=$2,cancel_reason=$3,updated_at=now() WHERE id=$1", [item.order_id, userId, why]);
    await recordComandaEvent(client, { type: "ITEM_CANCELED", comandaId: row.comanda_id, sessionId: row.session_id, orderId: item.order_id, actorUserId: userId, details: { itemId, product: item.product_name, quantity: item.quantity, reason: why } });
  });
}

/** Cancela uma abertura que não tem itens (por engano, ou o cliente foi embora sem pedir). Com itens, a conta precisa ser cobrada. */
export async function cancelComandaSession(sessionId: string, reason: string, userId: string) {
  const why = reasonSchema.parse(reason);
  return inTransaction(async (client) => {
    await requireActiveStore(client, "cancelar a comanda");
    const session = (await client.query<{ comanda_id: string; status: string }>("SELECT comanda_id,status FROM comanda_sessions WHERE id=$1 FOR UPDATE", [sessionId])).rows[0];
    if (!session) throw new AppError("Comanda não encontrada.", 404);
    if (session.status !== "OPEN") throw new AppError("Esta comanda já foi encerrada.", 409, "SESSION_CLOSED");
    const active = await client.query("SELECT 1 FROM comanda_order_items i JOIN comanda_orders o ON o.id=i.order_id WHERE o.session_id=$1 AND i.canceled_at IS NULL", [sessionId]);
    if (active.rowCount) throw new AppError("A comanda tem itens lançados. Cobre a conta no PDV ou cancele os itens antes.", 409, "HAS_ITEMS");
    await client.query("UPDATE comanda_sessions SET status='CANCELED',closed_at=now(),closed_by_id=$2,cancel_reason=$3,updated_at=now() WHERE id=$1", [sessionId, userId, why]);
    await recordComandaEvent(client, { type: "SESSION_CANCELED", comandaId: session.comanda_id, sessionId, actorUserId: userId, details: { reason: why } });
  });
}

/* ------------------------------------------------------------------ fechamento pela venda (usado por sales/service.ts) */

export type CartLine = { productId: string; quantity: number };

/** Dentro da transação da venda: trava a abertura e confere que o carrinho do PDV é exatamente o que está na comanda. */
export async function lockSessionForSale(client: PoolClient, sessionId: string, cart: CartLine[]) {
  const session = (await client.query<{ comanda_id: string; status: string; player_id: string }>("SELECT comanda_id,status,player_id FROM comanda_sessions WHERE id=$1 FOR UPDATE", [sessionId])).rows[0];
  if (!session) throw new AppError("Comanda não encontrada.", 404, "COMANDA_NOT_FOUND");
  if (session.status !== "OPEN") throw new AppError("Esta comanda já foi encerrada.", 409, "SESSION_CLOSED");
  const lines = (await client.query<{ product_id: string; quantity: number }>(`SELECT i.product_id,sum(i.quantity)::int quantity FROM comanda_order_items i JOIN comanda_orders o ON o.id=i.order_id
    WHERE o.session_id=$1 AND i.canceled_at IS NULL GROUP BY i.product_id`, [sessionId])).rows;
  const expected = new Map(lines.map((line) => [line.product_id, line.quantity]));
  const sent = new Map(cart.map((line) => [line.productId, line.quantity]));
  const same = expected.size === sent.size && [...expected].every(([id, quantity]) => sent.get(id) === quantity);
  if (!lines.length || !same) throw new AppError("A comanda mudou desde que foi aberta no PDV. Recarregue a comanda e tente de novo.", 409, "COMANDA_CHANGED");
  return session;
}

/** Depois de gravar a venda: encerra a abertura ligada a ela. A comanda fica livre para o próximo cliente. */
export async function closeSessionWithSale(client: PoolClient, session: { comanda_id: string }, sessionId: string, saleId: number, userId: string, totalCents: number) {
  await client.query("UPDATE sales SET comanda_session_id=$2 WHERE id=$1", [saleId, sessionId]);
  await client.query("UPDATE comanda_sessions SET status='CLOSED',closed_at=now(),closed_by_id=$2,sale_id=$3,updated_at=now() WHERE id=$1", [sessionId, userId, saleId]);
  await recordComandaEvent(client, { type: "SESSION_CLOSED", comandaId: session.comanda_id, sessionId, actorUserId: userId, details: { saleId, totalCents } });
}

/** Carrinho do PDV para cobrar uma comanda: os itens da conta com o que o PDV precisa (preço atual, estoque e desconto máximo). */
export async function loadSessionCart(sessionId: string) {
  const detail = await getSessionDetail(sessionId);
  if (!detail || detail.status !== "OPEN") return null;
  const items = (await pool.query<{ id: string; sku: string; barcode: string | null; name: string; image_key: string | null; sale_price_cents: number; max_discount_bps: number; stock: number; unit_code: string; quantity: number }>(`SELECT p.id,p.sku,p.barcode,p.name,p.image_key,p.sale_price_cents,p.max_discount_bps,
      COALESCE(ps.quantity,0)::int stock,u.code unit_code,sum(i.quantity)::int quantity
    FROM comanda_order_items i JOIN comanda_orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id JOIN units u ON u.id=p.unit_id
    LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.store_id=app_current_store()
    WHERE o.session_id=$1 AND i.canceled_at IS NULL GROUP BY p.id,p.sku,p.barcode,p.name,p.image_key,p.sale_price_cents,p.max_discount_bps,ps.quantity,u.code ORDER BY p.name`, [sessionId])).rows;
  const credit = (await pool.query<{ credit_balance_cents: number }>("SELECT credit_balance_cents FROM players WHERE id=$1", [detail.player_id])).rows[0]?.credit_balance_cents ?? 0;
  return {
    sessionId, number: detail.number, totalCents: detail.totalCents,
    player: { id: detail.player_id, name: detail.player_name, email: detail.player_email, phone: detail.player_phone, creditBalanceCents: credit, provisional: detail.provisional },
    items: items.map((row) => ({ id: row.id, sku: row.sku, barcode: row.barcode, name: row.name, imageKey: row.image_key, salePriceCents: row.sale_price_cents, maxDiscountBps: row.max_discount_bps, stockQuantity: row.stock, unitCode: row.unit_code, quantity: row.quantity, discountBasisPoints: 0 })),
  };
}

/* ------------------------------------------------------------------ cadastro provisório do jogador */

const completePlayerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido.").max(255).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/** O atendente completa o cadastro de um jogador criado às pressas ao abrir a comanda. */
export async function completeProvisionalPlayer(playerId: string, input: unknown, userId: string, sessionId?: string) {
  const parsed = completePlayerSchema.parse(input);
  await inTransaction(async (client) => {
    const result = await client.query("UPDATE players SET name=$2,phone=$3,email=$4,notes=$5,provisional=false,updated_at=now() WHERE id=$1 AND provisional RETURNING id",
      [playerId, parsed.name, parsed.phone || null, parsed.email || null, parsed.notes || null]);
    if (!result.rowCount) throw new AppError("Este cadastro já foi completado ou não existe.", 409, "NOT_PROVISIONAL");
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'PLAYER_COMPLETE','player',$2,$3)", [userId, playerId, JSON.stringify({ name: parsed.name, hasPhone: Boolean(parsed.phone), hasEmail: Boolean(parsed.email) })]);
    if (sessionId) {
      const comandaId = (await client.query<{ comanda_id: string }>("SELECT comanda_id FROM comanda_sessions WHERE id=$1", [sessionId])).rows[0]?.comanda_id;
      await recordComandaEvent(client, { type: "PLAYER_COMPLETED", comandaId, sessionId, actorUserId: userId, details: { playerId } });
    }
  });
}

/* ------------------------------------------------------------------ pedidos novos (aviso no balcão) */

export type NewOrderRow = { id: string; created_at: Date; session_id: string; number: number; player_name: string; items: { name: string; quantity: number }[] };

export async function listNewOrders(limit = 20) {
  return (await pool.query<NewOrderRow>(`SELECT o.id,o.created_at,o.session_id,c.number,p.name player_name,
      COALESCE((SELECT json_agg(json_build_object('name',i.product_name,'quantity',i.quantity) ORDER BY i.product_name) FROM comanda_order_items i WHERE i.order_id=o.id AND i.canceled_at IS NULL),'[]'::json) items
    FROM comanda_orders o JOIN comanda_sessions s ON s.id=o.session_id AND s.status='OPEN' JOIN comandas c ON c.id=s.comanda_id JOIN players p ON p.id=s.player_id
    WHERE o.status='NEW' AND o.source='CUSTOMER' ORDER BY o.created_at LIMIT $1`, [limit])).rows;
}

/* ------------------------------------------------------------------ auditoria */

export type EventRow = {
  id: string; created_at: Date; type: string; outcome: string; number: number | null; actor_name: string | null; ip: string | null; user_agent: string | null; device_info: Record<string, unknown> | null;
  latitude: number | null; longitude: number | null; accuracy_meters: number | null; distance_meters: number | null; details: Record<string, unknown> | null; anonymized_at: Date | null;
  session_id: string | null; total_count: number;
};

export async function listComandaEvents(filters: { type?: string; outcome?: string; comandaId?: string; sessionId?: string; from?: string; to?: string }, page: number, perPage: number) {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace("?", `$${values.length}`)); };
  if (filters.type) add("e.type=?", filters.type);
  if (filters.outcome) add("e.outcome=?", filters.outcome);
  if (filters.comandaId) add("e.comanda_id=?::uuid", filters.comandaId);
  if (filters.sessionId) add("e.session_id=?::uuid", filters.sessionId);
  if (filters.from) add("e.created_at >= ?::date", filters.from);
  if (filters.to) add("e.created_at < ?::date + interval '1 day'", filters.to);
  values.push(perPage, (page - 1) * perPage);
  return (await pool.query<EventRow>(`SELECT e.id,e.created_at,e.type,e.outcome,c.number,u.name actor_name,e.ip,e.user_agent,e.device_info,e.latitude,e.longitude,e.accuracy_meters,e.distance_meters,e.details,e.anonymized_at,e.session_id,count(*) OVER()::int total_count
    FROM comanda_events e LEFT JOIN comandas c ON c.id=e.comanda_id LEFT JOIN users u ON u.id=e.actor_user_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY e.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows;
}

export type { RequestInfo };
