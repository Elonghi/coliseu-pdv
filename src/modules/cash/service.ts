import { z } from "zod";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";

const money = z.number().int().min(0).max(2_147_483_647);

async function expectedCash(client: { query: typeof pool.query }, sessionId: string) {
  const result = await client.query<{ expected: number }>(`SELECT
    cs.opening_amount_cents
    + COALESCE((SELECT sum(CASE WHEN cm.type='SUPPLY' THEN cm.amount_cents ELSE -cm.amount_cents END) FROM cash_movements cm WHERE cm.session_id=cs.id),0)
    + COALESCE((SELECT sum(p.amount_applied_cents) FROM sales s JOIN payments p ON p.sale_id=s.id WHERE s.cash_session_id=cs.id AND s.status='CONFIRMED' AND p.method_code='CASH'),0) AS expected
    FROM cash_sessions cs WHERE cs.id=$1`, [sessionId]);
  return Number(result.rows[0]?.expected ?? 0);
}

export async function createCashRegister(name: string, userId: string) {
  const parsed = z.string().trim().min(2).max(80).parse(name);
  const result = await pool.query<{ id: string }>("INSERT INTO cash_registers(name) VALUES ($1) RETURNING id", [parsed]);
  await pool.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'CASH_REGISTER_CREATE','cash_register',$2,$3)", [userId, result.rows[0].id, JSON.stringify({ name: parsed })]);
}

export async function openCashSession(input: unknown, userId: string) {
  const parsed = z.object({ registerId: z.string().uuid(), openingAmountCents: money, notes: z.string().trim().max(1000).optional() }).parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const register = await client.query("SELECT id FROM cash_registers WHERE id=$1 AND active=true FOR UPDATE", [parsed.registerId]);
    if (!register.rowCount) throw new AppError("Caixa não encontrado ou inativo.", 404);
    const open = await client.query("SELECT id FROM cash_sessions WHERE status='OPEN' AND (register_id=$1 OR operator_id=$2) FOR UPDATE", [parsed.registerId, userId]);
    if (open.rowCount) throw new AppError("Este caixa ou operador já possui uma sessão aberta.", 409, "CASH_ALREADY_OPEN");
    const session = await client.query<{ id: string }>("INSERT INTO cash_sessions(register_id,operator_id,opening_amount_cents,notes) VALUES ($1,$2,$3,$4) RETURNING id", [parsed.registerId, userId, parsed.openingAmountCents, parsed.notes || null]);
    await client.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'CASH_OPEN','cash_session',$2,$3)", [userId, session.rows[0].id, JSON.stringify(parsed)]);
    await client.query("COMMIT");
    return session.rows[0].id;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function addCashMovement(input: unknown, userId: string, allowAnyOperator = false) {
  const parsed = z.object({ sessionId: z.string().uuid(), type: z.enum(["SUPPLY", "WITHDRAWAL"]), amountCents: money.positive(), reason: z.string().trim().min(5).max(300) }).parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await client.query("SELECT id FROM cash_sessions WHERE id=$1 AND status='OPEN' AND ($2::boolean OR operator_id=$3) FOR UPDATE", [parsed.sessionId, allowAnyOperator, userId]);
    if (!session.rowCount) throw new AppError("Sessão de caixa não está aberta.", 409);
    if (parsed.type === "WITHDRAWAL" && parsed.amountCents > await expectedCash(client, parsed.sessionId)) throw new AppError("A sangria não pode superar o saldo esperado do caixa.", 409);
    const movement = await client.query<{ id: string }>("INSERT INTO cash_movements(session_id,type,amount_cents,reason,user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id", [parsed.sessionId, parsed.type, parsed.amountCents, parsed.reason, userId]);
    await client.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'CASH_MOVEMENT','cash_movement',$2,$3)", [userId, movement.rows[0].id, JSON.stringify(parsed)]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function closeCashSession(input: unknown, userId: string, allowAnyOperator = false) {
  const parsed = z.object({ sessionId: z.string().uuid(), countedCents: money, notes: z.string().trim().max(1000).optional() }).parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await client.query("SELECT id FROM cash_sessions WHERE id=$1 AND status='OPEN' AND ($2::boolean OR operator_id=$3) FOR UPDATE", [parsed.sessionId, allowAnyOperator, userId]);
    if (!session.rowCount) throw new AppError("Sessão de caixa não está aberta.", 409);
    const expected = await expectedCash(client, parsed.sessionId);
    const difference = parsed.countedCents - expected;
    await client.query("UPDATE cash_sessions SET status='CLOSED',closing_counted_cents=$1,expected_amount_cents=$2,difference_cents=$3,closed_at=now(),closed_by_id=$4,notes=concat_ws(E'\\n',notes,$5::text),updated_at=now() WHERE id=$6", [parsed.countedCents, expected, difference, userId, parsed.notes || null, parsed.sessionId]);
    await client.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'CASH_CLOSE','cash_session',$2,$3)", [userId, parsed.sessionId, JSON.stringify({ countedCents: parsed.countedCents, expectedCents: expected, differenceCents: difference })]);
    await client.query("COMMIT");
    return { expectedCents: expected, differenceCents: difference };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
