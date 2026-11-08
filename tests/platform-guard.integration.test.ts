import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

/* Aqui o app conecta com o usuário do banco que tem privilégio total (como o compose faz até o papel sem privilégio ser configurado). */
suite("painel do sistema sem as travas valendo: só o primeiro lojista e a primeira loja", () => {
  let owner: pg.Client;
  let service: typeof import("@/modules/platform/service");
  let status: typeof import("@/modules/platform/status");
  let adminId: string;
  const input = (email: string, name: string) => ({ name, ownerName: "Titular", ownerEmail: email, ownerPassword: "senha-provisoria-1", storeName: `Loja ${name}` });

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL = url;
    delete process.env.APP_DATABASE_URL;
    owner = new pg.Client({ connectionString: url });
    await owner.connect();
    service = await import("@/modules/platform/service");
    status = await import("@/modules/platform/status");
  });
  afterAll(async () => { const { pool } = await import("@/db"); await pool.end(); await owner?.end(); });
  beforeEach(async () => {
    await owner.query("TRUNCATE accounts RESTART IDENTITY CASCADE");
    adminId = (await owner.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role,is_platform_admin) VALUES ('Dono','dono@guard.test','x','ADMIN',true) RETURNING id")).rows[0].id;
  });

  it("o diagnóstico acusa que o usuário do banco ignora as travas", async () => {
    const isolation = await status.isolationStatus();
    expect(isolation.privilegedRole).toBe(true);
    expect(isolation.enforced).toBe(false);
    expect(isolation.unprotected).toEqual([]);
  });

  it("cria o primeiro lojista, mas recusa o segundo e uma segunda loja, com a orientação de ativar o isolamento", async () => {
    const first = await service.asPlatform(() => service.createAccount(input("um@guard.test", "Um"), adminId));
    await expect(service.asPlatform(() => service.createAccount(input("dois@guard.test", "Dois"), adminId))).rejects.toThrow(/ative o isolamento do banco/);
    await expect(service.asPlatform(() => service.addStore(first, { name: "Segunda loja", cnpj: "" }, adminId))).rejects.toThrow(/ative o isolamento do banco/);
    expect((await owner.query("SELECT count(*)::int n FROM accounts")).rows[0].n).toBe(1);
    expect((await owner.query("SELECT count(*)::int n FROM stores")).rows[0].n).toBe(1);
  });

  it("o estado das migrations compara o que o código espera com o que o banco aplicou", async () => {
    const migrations = await status.migrationStatus();
    expect(migrations.expected).toBeGreaterThanOrEqual(19);
    expect(migrations.applied).toBe(migrations.expected);
    expect(migrations.pending).toBe(false);
  });
});
