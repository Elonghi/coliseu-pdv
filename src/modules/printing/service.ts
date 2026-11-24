import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "@/db";
import { rawPool } from "@/db/raw";
import { runWithScope, type DbScope } from "@/db/scope";
import { AppError } from "@/lib/errors";
import { saleNumber } from "@/lib/money";
import { requireActiveStore } from "@/modules/stores/context";
import { codePageNames, isCodePage } from "./code-pages";
import type { PrinterProfile } from "./escpos";
import { saleReceipt, testPage, type SaleReceipt } from "./receipt";
import { createAgentToken, parseAgentToken, sameHash } from "./token";

/** O agente é considerado conectado se buscou trabalho há menos disto (ele volta a cada ~25 s). */
export const AGENT_ONLINE_MS = 60_000;
/** Trabalho que ninguém buscou nesse tempo expira, para o caixa não imprimir uma pilha de cupons antigos ao religar. */
const QUEUE_TTL = "10 minutes";

export const terminalSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da impressora.").max(80, "Use até 80 caracteres no nome."),
  columns: z.coerce.number().int().min(24, "Use de 24 a 80 colunas.").max(80, "Use de 24 a 80 colunas."),
  codePage: z.enum(codePageNames as [string, ...string[]], { message: "Página de código inválida." }),
  cut: z.boolean(),
});
export type TerminalInput = z.infer<typeof terminalSchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids vindos de formulário: um valor inválido vira "não encontrado" em vez de erro de sintaxe do banco. */
function terminalId(value: string) {
  if (!UUID.test(value)) throw new AppError("Impressora não encontrada.", 404, "PRINT_TERMINAL_NOT_FOUND");
  return value;
}

type ProfileRow = { columns: number; code_page: string; cut: boolean };
export const profileOf = (row: ProfileRow): PrinterProfile => ({ columns: row.columns, codePage: isCodePage(row.code_page) ? row.code_page : "ASCII", cut: row.cut });

const audit = (client: Pick<typeof pool, "query">, userId: string, action: string, id: string, after: unknown) =>
  client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,$2,'print_terminal',$3,$4)", [userId, action, id, JSON.stringify(after)]);

/** Cadastra a impressora de um caixa na loja ativa. O token aparece só nesta resposta; o banco guarda o hash. */
export async function createTerminal(input: TerminalInput, userId: string) {
  const data = terminalSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const storeId = await requireActiveStore(client, "cadastrar uma impressora");
    const id = randomUUID();
    const { token, hash } = createAgentToken(storeId, id);
    await client.query("INSERT INTO print_terminals (id,name,token_hash,columns,code_page,cut,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, data.name, hash, data.columns, data.codePage, data.cut, userId]);
    await audit(client, userId, "PRINT_TERMINAL_CREATE", id, { name: data.name, columns: data.columns, codePage: data.codePage, cut: data.cut });
    await client.query("COMMIT");
    return { id, token };
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") throw new AppError("Já existe uma impressora com esse nome nesta loja.", 409, "PRINT_TERMINAL_DUPLICATE");
    throw error;
  } finally { client.release(); }
}

export async function updateTerminal(id: string, input: TerminalInput, userId: string) {
  const data = terminalSchema.parse(input);
  try {
    const result = await pool.query("UPDATE print_terminals SET name=$2,columns=$3,code_page=$4,cut=$5,updated_at=now() WHERE id=$1", [terminalId(id), data.name, data.columns, data.codePage, data.cut]);
    if (!result.rowCount) throw new AppError("Impressora não encontrada.", 404, "PRINT_TERMINAL_NOT_FOUND");
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AppError("Já existe uma impressora com esse nome nesta loja.", 409, "PRINT_TERMINAL_DUPLICATE");
    throw error;
  }
  await audit(pool, userId, "PRINT_TERMINAL_UPDATE", id, data);
}

/** Gera um token novo e invalida o anterior (o agente antigo para de funcionar na próxima busca). */
export async function rotateTerminalToken(id: string, userId: string) {
  const row = (await pool.query<{ store_id: string }>("SELECT store_id FROM print_terminals WHERE id=$1", [terminalId(id)])).rows[0];
  if (!row) throw new AppError("Impressora não encontrada.", 404, "PRINT_TERMINAL_NOT_FOUND");
  const { token, hash } = createAgentToken(row.store_id, id);
  await pool.query("UPDATE print_terminals SET token_hash=$2,last_seen_at=NULL,agent_info=NULL,updated_at=now() WHERE id=$1", [id, hash]);
  await audit(pool, userId, "PRINT_TERMINAL_TOKEN", id, {});
  return token;
}

export async function setTerminalActive(id: string, active: boolean, userId: string) {
  const result = await pool.query("UPDATE print_terminals SET active=$2,updated_at=now() WHERE id=$1", [terminalId(id), active]);
  if (!result.rowCount) throw new AppError("Impressora não encontrada.", 404, "PRINT_TERMINAL_NOT_FOUND");
  if (!active) await pool.query("UPDATE print_jobs SET status='FAILED',error='Impressora desativada.',finished_at=now() WHERE terminal_id=$1 AND status='QUEUED'", [id]);
  await audit(pool, userId, active ? "PRINT_TERMINAL_ENABLE" : "PRINT_TERMINAL_DISABLE", id, {});
}

async function activeTerminal(id: string) {
  const row = (await pool.query<ProfileRow & { id: string; name: string; active: boolean }>("SELECT id,name,columns,code_page,cut,active FROM print_terminals WHERE id=$1", [terminalId(id)])).rows[0];
  if (!row) throw new AppError("Impressora não encontrada nesta loja.", 404, "PRINT_TERMINAL_NOT_FOUND");
  if (!row.active) throw new AppError("Esta impressora está desativada.", 409, "PRINT_TERMINAL_INACTIVE");
  return row;
}

async function enqueue(printerId: string, kind: "SALE_RECEIPT" | "TEST", payload: Buffer, userId: string, saleId: number | null = null) {
  const result = await pool.query<{ id: string }>("INSERT INTO print_jobs (terminal_id,kind,sale_id,payload,requested_by_id) VALUES ($1,$2,$3,$4,$5) RETURNING id", [printerId, kind, saleId, payload, userId]);
  return result.rows[0].id;
}

/** Dados do comprovante, lidos no escopo da requisição (a venda precisa ser da loja visível). */
export async function loadSaleReceipt(saleId: number): Promise<SaleReceipt & { operatorId: string }> {
  if (!Number.isSafeInteger(saleId) || saleId <= 0) throw new AppError("Venda não encontrada.", 404, "SALE_NOT_FOUND");
  const sale = (await pool.query<{ id: number; status: string; created_at: Date; subtotal_cents: number; discount_cents: number; total_cents: number; operator_id: string; operator_name: string; store_name: string; store_cnpj: string | null }>(
    `SELECT s.id,s.status,s.created_at,s.subtotal_cents,s.discount_cents,s.total_cents,s.operator_id,u.name operator_name,st.name store_name,st.cnpj store_cnpj
     FROM sales s JOIN users u ON u.id=s.operator_id JOIN stores st ON st.id=s.store_id WHERE s.id=$1`, [saleId])).rows[0];
  if (!sale) throw new AppError("Venda não encontrada.", 404, "SALE_NOT_FOUND");
  const [items, payments] = await Promise.all([
    pool.query<{ product_name: string; sku: string; unit_code: string; quantity: number; unit_price_cents: number; discount_bps: number; gross_cents: number; discount_cents: number; total_cents: number }>(
      "SELECT product_name,sku,unit_code,quantity,unit_price_cents,discount_bps,gross_cents,discount_cents,total_cents FROM sale_items WHERE sale_id=$1 ORDER BY product_name,id", [saleId]),
    pool.query<{ code: string; name: string; amount_applied_cents: number; amount_received_cents: number | null; change_cents: number; player_name: string | null; due_date: string | null }>(
      `SELECT p.method_code code,pm.name,p.amount_applied_cents,p.amount_received_cents,p.change_cents,pl.name player_name,to_char(p.due_date,'YYYY-MM-DD') due_date
       FROM payments p JOIN payment_methods pm ON pm.code=p.method_code LEFT JOIN players pl ON pl.id=p.player_id WHERE p.sale_id=$1 ORDER BY pm.sort_order,p.method_code`, [saleId]),
  ]);
  return {
    operatorId: sale.operator_id,
    storeName: sale.store_name,
    storeCnpj: sale.store_cnpj,
    number: saleNumber(sale.id),
    createdAt: sale.created_at,
    operatorName: sale.operator_name,
    canceled: sale.status === "CANCELED",
    items: items.rows.map((row) => ({ name: row.product_name, sku: row.sku, unitCode: row.unit_code, quantity: row.quantity, unitPriceCents: row.unit_price_cents, discountBps: row.discount_bps, grossCents: row.gross_cents, discountCents: row.discount_cents, totalCents: row.total_cents })),
    subtotalCents: sale.subtotal_cents,
    discountCents: sale.discount_cents,
    totalCents: sale.total_cents,
    payments: payments.rows.map((row) => ({ code: row.code, name: row.name, amountAppliedCents: row.amount_applied_cents, amountReceivedCents: row.amount_received_cents, changeCents: row.change_cents, playerName: row.player_name, dueDate: row.due_date })),
  };
}

/** Põe o comprovante da venda na fila da impressora. Se a venda já teve um comprovante impresso, sai como 2ª via. */
export async function enqueueSaleReceipt(saleId: number, printerId: string, user: { id: string; role: "ADMIN" | "OPERATOR" }) {
  const terminal = await activeTerminal(printerId);
  const sale = await loadSaleReceipt(saleId);
  if (user.role !== "ADMIN" && sale.operatorId !== user.id) throw new AppError("Só quem fez a venda ou um administrador pode imprimir o comprovante.", 403, "FORBIDDEN");
  const printed = await pool.query("SELECT 1 FROM print_jobs WHERE sale_id=$1 AND kind='SALE_RECEIPT' AND status='PRINTED' LIMIT 1", [saleId]);
  const payload = saleReceipt({ ...sale, reprintedAt: printed.rowCount ? new Date() : null }, profileOf(terminal));
  return enqueue(terminal.id, "SALE_RECEIPT", payload, user.id, saleId);
}

export async function enqueueTestPage(printerId: string, userId: string) {
  const terminal = await activeTerminal(printerId);
  const store = (await pool.query<{ name: string }>("SELECT st.name FROM print_terminals t JOIN stores st ON st.id=t.store_id WHERE t.id=$1", [terminal.id])).rows[0];
  const payload = testPage({ terminalName: terminal.name, storeName: store?.name ?? "", at: new Date() }, profileOf(terminal));
  return enqueue(terminal.id, "TEST", payload, userId);
}

export async function getJobStatus(jobId: string, user: { id: string; role: "ADMIN" | "OPERATOR" }) {
  if (!UUID.test(jobId)) throw new AppError("Impressão não encontrada.", 404, "PRINT_JOB_NOT_FOUND");
  const row = (await pool.query<{ status: string; error: string | null; requested_by_id: string | null }>("SELECT status,error,requested_by_id FROM print_jobs WHERE id=$1", [jobId])).rows[0];
  if (!row || (user.role !== "ADMIN" && row.requested_by_id !== user.id)) throw new AppError("Impressão não encontrada.", 404, "PRINT_JOB_NOT_FOUND");
  return { status: row.status as "QUEUED" | "SENT" | "PRINTED" | "FAILED", error: row.error };
}

/* ---------- lado do agente (sem sessão de usuário: tudo roda no escopo da loja dona do token) ---------- */

export type AgentContext = { terminalId: string; storeId: string; scope: DbScope };

export async function authenticateAgent(token: string): Promise<AgentContext | null> {
  const parsed = parseAgentToken(token);
  if (!parsed) return null;
  const store = (await rawPool.query<{ account_id: string }>("SELECT s.account_id FROM stores s JOIN accounts a ON a.id=s.account_id WHERE s.id=$1 AND s.active AND a.active", [parsed.storeId])).rows[0];
  if (!store) return null;
  const scope: DbScope = { accountId: store.account_id, storeId: parsed.storeId, storeIds: [parsed.storeId] };
  const terminal = await runWithScope(scope, async () => (await pool.query<{ token_hash: string; active: boolean }>("SELECT token_hash,active FROM print_terminals WHERE id=$1", [parsed.terminalId])).rows[0]);
  if (!terminal?.active || !sameHash(terminal.token_hash, token)) return null;
  return { terminalId: parsed.terminalId, storeId: parsed.storeId, scope };
}

/** Loja e impressora do token, para o instalador do agente confirmar que o token colado é o certo. Não mexe na fila. */
export async function describeAgent(agent: AgentContext) {
  const row = (await runWithScope(agent.scope, () => pool.query<{ terminal: string; store: string }>(
    "SELECT t.name terminal,s.name store FROM print_terminals t JOIN stores s ON s.id=t.store_id WHERE t.id=$1", [agent.terminalId]))).rows[0];
  return { store: row?.store ?? null, terminal: row?.terminal ?? null };
}

export function agentHeartbeat(agent: AgentContext, info: string | null) {
  return runWithScope(agent.scope, () => pool.query("UPDATE print_terminals SET last_seen_at=now(),agent_info=COALESCE($2,agent_info) WHERE id=$1", [agent.terminalId, info ? info.slice(0, 200) : null]));
}

/** Entrega ao agente o trabalho mais antigo da fila, marcando-o como enviado. SKIP LOCKED evita entregar o mesmo duas vezes. */
export function claimNextJob(agent: AgentContext) {
  return runWithScope(agent.scope, async () => {
    await pool.query(`UPDATE print_jobs SET status='FAILED',error='Expirou sem o agente buscar.',finished_at=now() WHERE terminal_id=$1 AND status='QUEUED' AND created_at < now()-interval '${QUEUE_TTL}'`, [agent.terminalId]);
    const result = await pool.query<{ id: string; kind: string; payload: Buffer }>(
      `UPDATE print_jobs SET status='SENT',attempts=attempts+1,sent_at=now() WHERE id=(
         SELECT id FROM print_jobs WHERE terminal_id=$1 AND status='QUEUED' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING id,kind,payload`, [agent.terminalId]);
    return result.rows[0] ?? null;
  });
}

export async function finishJob(agent: AgentContext, jobId: string, ok: boolean, error?: string) {
  const result = await runWithScope(agent.scope, () => pool.query(
    "UPDATE print_jobs SET status=$3,error=$4,finished_at=now() WHERE id=$1 AND terminal_id=$2 AND status='SENT'",
    [jobId, agent.terminalId, ok ? "PRINTED" : "FAILED", ok ? null : (error || "Falha sem detalhe no agente.").slice(0, 500)]));
  return Boolean(result.rowCount);
}
