import { z } from "zod";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { applyPlayerCreditMovement } from "@/modules/players/service";

const accountSchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"]),
  description: z.string().trim().min(3).max(220),
  counterpartyName: z.string().trim().min(2).max(180),
  playerId: z.string().uuid().optional(),
  issueDate: z.string().date(),
  totalCents: z.number().int().positive().max(2_147_483_647),
  terms: z.string().trim().max(100).default("0"),
  notes: z.string().trim().max(2000).optional(),
});

function installmentDates(issueDate: string, terms: string) {
  const days = (terms || "0").split(/[\s,;/]+/).filter(Boolean).map(Number);
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 3650) || new Set(days).size !== days.length) {
    throw new AppError("Informe prazos únicos em dias, como 0/30/60/90.");
  }
  return days.sort((a, b) => a - b).map((day) => {
    const date = new Date(`${issueDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day);
    return date.toISOString().slice(0, 10);
  });
}

export async function createFinancialAccount(input: unknown, userId: string) {
  const parsed = accountSchema.parse(input);
  const dates = installmentDates(parsed.issueDate, parsed.terms);
  const base = Math.floor(parsed.totalCents / dates.length);
  const remainder = parsed.totalCents % dates.length;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (parsed.playerId) {
      const player = await client.query("SELECT id FROM players WHERE id=$1 AND active=true", [parsed.playerId]);
      if (!player.rowCount) throw new AppError("Jogador não encontrado ou inativo.");
    }
    const account = await client.query<{ id: string }>(`INSERT INTO financial_accounts
      (type,description,counterparty_name,player_id,issue_date,total_cents,notes,created_by_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [parsed.type, parsed.description, parsed.counterpartyName, parsed.playerId ?? null, parsed.issueDate, parsed.totalCents, parsed.notes ?? null, userId]);
    for (let index = 0; index < dates.length; index++) {
      await client.query("INSERT INTO financial_installments (account_id,installment_number,due_date,amount_cents) VALUES ($1,$2,$3,$4)", [account.rows[0].id, index + 1, dates[index], base + (index < remainder ? 1 : 0)]);
    }
    if (parsed.type === "RECEIVABLE" && parsed.playerId) {
      await applyPlayerCreditMovement(client, { playerId: parsed.playerId, amountCents: -parsed.totalCents, type: "FUTURE_CHARGE", userId, financialAccountId: account.rows[0].id, notes: `Conta a receber: ${parsed.description}` });
    }
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FINANCIAL_ACCOUNT_CREATE','financial_account',$2,$3)", [userId, account.rows[0].id, JSON.stringify({ ...parsed, installmentDates: dates })]);
    await client.query("COMMIT");
    return account.rows[0].id;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

const settlementSchema = z.object({
  installmentId: z.string().uuid(), amountCents: z.number().int().positive(), methodCode: z.string().min(1).max(30),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), personName: z.string().trim().max(180).optional(), notes: z.string().trim().max(1000).optional(),
});

export async function settleFinancialInstallment(input: unknown, userId: string) {
  const parsed = settlementSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const installment = await client.query<{ id: string; account_id: string; amount_cents: number; settled_cents: number; status: string; type: "PAYABLE" | "RECEIVABLE"; player_id: string | null; description: string }>(`SELECT i.id,i.account_id,i.amount_cents,i.settled_cents,i.status,a.type,a.player_id,a.description
      FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id WHERE i.id=$1 FOR UPDATE OF i,a`, [parsed.installmentId]);
    const current = installment.rows[0];
    if (!current || current.status === "CANCELED" || current.status === "SETTLED") throw new AppError("Parcela não está disponível para liquidação.", 409);
    const remaining = current.amount_cents - current.settled_cents;
    if (parsed.amountCents > remaining) throw new AppError(`Valor maior que o saldo da parcela (${remaining} centavos).`);
    const method = await client.query("SELECT code FROM payment_methods WHERE code=$1 AND active=true AND code NOT IN ('FUTURE','PLAYER_CREDIT')", [parsed.methodCode]);
    if (!method.rowCount) throw new AppError("Forma de pagamento inválida.");
    await client.query(`INSERT INTO financial_settlements (installment_id,amount_cents,method_code,occurred_at,person_name,notes,created_by_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [current.id, parsed.amountCents, parsed.methodCode, new Date(`${parsed.occurredAt}:00-03:00`), parsed.personName || null, parsed.notes || null, userId]);
    const settled = current.settled_cents + parsed.amountCents;
    await client.query("UPDATE financial_installments SET settled_cents=$1,status=$2,updated_at=now() WHERE id=$3", [settled, settled === current.amount_cents ? "SETTLED" : "PARTIAL", current.id]);
    const totals = await client.query<{ total: number; settled: number }>("SELECT sum(amount_cents)::int AS total,sum(settled_cents)::int AS settled FROM financial_installments WHERE account_id=$1", [current.account_id]);
    const accountStatus = totals.rows[0].settled === totals.rows[0].total ? "SETTLED" : "PARTIAL";
    await client.query("UPDATE financial_accounts SET status=$1,updated_at=now() WHERE id=$2", [accountStatus, current.account_id]);
    if (current.type === "RECEIVABLE" && current.player_id) {
      await applyPlayerCreditMovement(client, { playerId: current.player_id, amountCents: parsed.amountCents, type: "FUTURE_PAYMENT", userId, financialAccountId: current.account_id, notes: `Recebimento: ${current.description}`, allowInactive: true });
    }
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FINANCIAL_SETTLEMENT_CREATE','financial_installment',$2,$3)", [userId, current.id, JSON.stringify(parsed)]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
