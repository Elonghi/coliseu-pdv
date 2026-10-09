import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";

export type CreditMovementType = "MANUAL" | "SALE_CREDIT" | "FUTURE_CHARGE" | "FUTURE_PAYMENT" | "SALE_REVERSAL";

export const playerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function applyPlayerCreditMovement(client: PoolClient, input: {
  playerId: string; amountCents: number; type: CreditMovementType; userId: string;
  saleId?: number; financialAccountId?: string; notes: string; allowInactive?: boolean;
}) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0) throw new AppError("Movimentação de crédito inválida.");
  const player = await client.query<{ id: string; name: string; active: boolean; credit_balance_cents: number }>("SELECT id,name,active,credit_balance_cents FROM players WHERE id=$1 FOR UPDATE", [input.playerId]);
  if (!player.rows[0] || (!player.rows[0].active && !input.allowInactive)) throw new AppError("Jogador não encontrado ou inativo.", 422, "PLAYER_INVALID");
  const balance = player.rows[0].credit_balance_cents + input.amountCents;
  if (!Number.isSafeInteger(balance) || Math.abs(balance) > 2_147_483_647) throw new AppError("Saldo de crédito excede o limite permitido.");
  await client.query("UPDATE players SET credit_balance_cents=$1,updated_at=now() WHERE id=$2", [balance, input.playerId]);
  await client.query(`INSERT INTO player_credit_movements (player_id,type,amount_cents,balance_after_cents,sale_id,financial_account_id,user_id,notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [input.playerId, input.type, input.amountCents, balance, input.saleId ?? null, input.financialAccountId ?? null, input.userId, input.notes]);
  return { balance, playerName: player.rows[0].name };
}

export async function createPlayer(input: unknown, userId: string) {
  const parsed = playerSchema.parse(input);
  const result = await pool.query<{ id: string }>("INSERT INTO players (name,email,phone,notes) VALUES ($1,$2,$3,$4) RETURNING id", [parsed.name, parsed.email || null, parsed.phone || null, parsed.notes || null]);
  await pool.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'PLAYER_CREATE','player',$2,$3)", [userId, result.rows[0].id, JSON.stringify(parsed)]);
  return result.rows[0].id;
}

export async function updatePlayer(id: string, input: unknown, active: boolean, userId: string) {
  const parsed = playerSchema.parse(input);
  const result = await pool.query("UPDATE players SET name=$1,email=$2,phone=$3,notes=$4,active=$5,updated_at=now() WHERE id=$6", [parsed.name, parsed.email || null, parsed.phone || null, parsed.notes || null, active, id]);
  if (!result.rowCount) throw new AppError("Jogador não encontrado.", 404);
  await pool.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'PLAYER_UPDATE','player',$2,$3)", [userId, id, JSON.stringify({ ...parsed, active })]);
}

export async function adjustPlayerCredit(playerId: string, amountCents: number, reason: string, userId: string) {
  if (reason.trim().length < 3) throw new AppError("Informe o motivo do ajuste.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const movement = await applyPlayerCreditMovement(client, { playerId, amountCents, type: "MANUAL", userId, notes: reason.trim() });
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'PLAYER_CREDIT_ADJUST','player',$2,$3)", [userId, playerId, JSON.stringify({ amountCents, reason, balance: movement.balance })]);
    await client.query("COMMIT");
    return movement;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
