import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const script = path.resolve("scripts/platform-admin.mjs");

suite("script que concede o acesso de administrador do sistema", () => {
  let db: pg.Client;
  const run = (args: string[]) => execFileSync(process.execPath, [script, ...args], { env: { ...process.env, DATABASE_URL: url!, MIGRATION_DATABASE_URL: "" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const flag = async (email: string) => (await db.query<{ is_platform_admin: boolean }>("SELECT is_platform_admin FROM users WHERE email=$1", [email])).rows[0].is_platform_admin;

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    db = new pg.Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await resetTenancy(db);
    await db.query("INSERT INTO users(name,email,password_hash,role) VALUES ('Dono','dono@script.test','x','ADMIN')");
    await db.query("INSERT INTO users(name,email,password_hash,role,account_id,is_platform_admin) VALUES ('Só sistema','so@script.test','x','ADMIN',NULL,true)");
  });

  it("simula por padrão e não altera nada", async () => {
    expect(run(["--email=dono@script.test"])).toContain("NADA foi alterado");
    expect(await flag("dono@script.test")).toBe(false);
  });

  it("concede e revoga com --apply, registrando na auditoria, e é repetível", async () => {
    expect(run(["--email=DONO@script.test", "--apply"])).toContain("agora é administrador do sistema");
    expect(await flag("dono@script.test")).toBe(true);
    expect(run(["--email=dono@script.test", "--apply"])).toContain("Nada a fazer");
    expect(run(["--email=dono@script.test", "--remove", "--apply"])).toContain("deixou de ser");
    expect(await flag("dono@script.test")).toBe(false);
    expect((await db.query("SELECT 1 FROM audit_logs WHERE action IN ('PLATFORM_ADMIN_GRANT','PLATFORM_ADMIN_REVOKE')")).rowCount).toBe(2);
  });

  it("não revoga quem não pertence a nenhum lojista e recusa e-mail desconhecido", async () => {
    expect(() => run(["--email=so@script.test", "--remove", "--apply"])).toThrow(/não pertence a nenhum lojista/);
    expect(await flag("so@script.test")).toBe(true);
    expect(() => run(["--email=ninguem@script.test"])).toThrow(/Nenhum usuário/);
    expect(() => run([])).toThrow(/Informe o e-mail/);
  });
});
