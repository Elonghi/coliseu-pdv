import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DbScope } from "@/db/scope";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("fila de impressão e agente local", () => {
  let pool: typeof import("@/db").pool;
  let runWithScope: typeof import("@/db/scope").runWithScope;
  let service: typeof import("@/modules/printing/service");
  let account: string; let lojaA: string; let lojaB: string; let userId: string;
  const scopeOf = (storeId: string): DbScope => ({ accountId: account, storeId, storeIds: [storeId] });
  const profile = { columns: 48, codePage: "CP860", cut: true };
  const inStore = <T>(storeId: string, run: () => Promise<T>) => runWithScope(scopeOf(storeId), run);

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL = url;
    ({ pool } = await import("@/db"));
    ({ runWithScope } = await import("@/db/scope"));
    service = await import("@/modules/printing/service");
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    await resetTenancy(pool);
    account = (await pool.query<{ id: string }>("SELECT id FROM accounts")).rows[0].id;
    lojaA = (await pool.query<{ id: string }>("SELECT id FROM stores")).rows[0].id;
    lojaB = (await pool.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja B') RETURNING id", [account])).rows[0].id;
    userId = (await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id) VALUES ('Admin','admin@print.test','x','ADMIN',$1) RETURNING id", [account])).rows[0].id;
  });

  it("o agente entra com o token, recebe o trabalho uma vez e confirma a impressão", async () => {
    const { id, token } = await inStore(lojaA, () => service.createTerminal({ name: "Caixa 1", ...profile }, userId));
    const jobId = await inStore(lojaA, () => service.enqueueTestPage(id, userId));

    const agent = await service.authenticateAgent(token);
    expect(agent).toMatchObject({ terminalId: id, storeId: lojaA });
    // O instalador confere o token sem tirar o trabalho da fila.
    const storeName = (await pool.query<{ name: string }>("SELECT name FROM stores WHERE id=$1", [lojaA])).rows[0].name;
    expect(await service.describeAgent(agent!)).toEqual({ store: storeName, terminal: "Caixa 1" });
    await service.agentHeartbeat(agent!, "agente 0.1.0 | caixa-1 | linux | POS-8370");

    const job = await service.claimNextJob(agent!);
    expect(job).toMatchObject({ id: jobId, kind: "TEST" });
    expect([...job!.payload.subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 3]);
    expect(await service.claimNextJob(agent!)).toBeNull();

    expect(await service.finishJob(agent!, jobId, true)).toBe(true);
    expect(await service.finishJob(agent!, jobId, false, "repetido")).toBe(false);
    const row = (await pool.query("SELECT status,attempts,error,finished_at FROM print_jobs WHERE id=$1", [jobId])).rows[0];
    expect(row).toMatchObject({ status: "PRINTED", attempts: 1, error: null });
    expect(row.finished_at).toBeTruthy();
    const terminal = (await pool.query("SELECT last_seen_at,agent_info FROM print_terminals WHERE id=$1", [id])).rows[0];
    expect(terminal.agent_info).toContain("POS-8370");
    expect(terminal.last_seen_at).toBeTruthy();
  });

  it("recusa token adulterado, token antigo depois de trocar e impressora desativada", async () => {
    const { id, token } = await inStore(lojaA, () => service.createTerminal({ name: "Caixa 1", ...profile }, userId));
    const [prefix, , terminal, secret] = token.split(".");
    expect(await service.authenticateAgent(`${prefix}.${lojaB}.${terminal}.${secret}`)).toBeNull();
    expect(await service.authenticateAgent(`${token.slice(0, -2)}xx`)).toBeNull();

    const renewed = await inStore(lojaA, () => service.rotateTerminalToken(id, userId));
    expect(await service.authenticateAgent(token)).toBeNull();
    expect(await service.authenticateAgent(renewed)).not.toBeNull();

    await inStore(lojaA, () => service.setTerminalActive(id, false, userId));
    expect(await service.authenticateAgent(renewed)).toBeNull();
  });

  it("cada agente só vê a fila da própria impressora, e trabalho antigo expira em vez de sair atrasado", async () => {
    const a = await inStore(lojaA, () => service.createTerminal({ name: "Caixa A", ...profile }, userId));
    const b = await inStore(lojaB, () => service.createTerminal({ name: "Caixa B", ...profile }, userId));
    const jobA = await inStore(lojaA, () => service.enqueueTestPage(a.id, userId));
    const agentB = (await service.authenticateAgent(b.token))!;
    expect(await service.claimNextJob(agentB)).toBeNull();
    expect(await service.finishJob(agentB, jobA, true)).toBe(false);
    await expect(inStore(lojaB, () => service.enqueueTestPage(a.id, userId))).rejects.toThrow();

    await pool.query("UPDATE print_jobs SET created_at=now()-interval '11 minutes' WHERE id=$1", [jobA]);
    const agentA = (await service.authenticateAgent(a.token))!;
    expect(await service.claimNextJob(agentA)).toBeNull();
    expect((await pool.query("SELECT status,error FROM print_jobs WHERE id=$1", [jobA])).rows[0]).toEqual({ status: "FAILED", error: "Expirou sem o agente buscar." });
  });

  it("o banco não deixa um trabalho apontar para a impressora de outra loja", async () => {
    const b = await inStore(lojaB, () => service.createTerminal({ name: "Caixa B", ...profile }, userId));
    await expect(inStore(lojaA, () => pool.query("INSERT INTO print_jobs (terminal_id,kind,payload) VALUES ($1,'TEST',$2)", [b.id, Buffer.from([0x1b, 0x40])]))).rejects.toThrow(/outra loja/);
  });

  it("nome repetido na mesma loja vira mensagem clara", async () => {
    await inStore(lojaA, () => service.createTerminal({ name: "Caixa 1", ...profile }, userId));
    await expect(inStore(lojaA, () => service.createTerminal({ name: "caixa 1", ...profile }, userId))).rejects.toThrow("Já existe uma impressora com esse nome nesta loja.");
    await expect(inStore(lojaB, () => service.createTerminal({ name: "Caixa 1", ...profile }, userId))).resolves.toBeTruthy();
  });
});
