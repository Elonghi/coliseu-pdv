import { execFileSync } from "node:child_process";
import path from "node:path";
import { compare } from "bcryptjs";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const script = path.resolve("scripts/platform-admin.mjs");

suite("script que concede o acesso de administrador do sistema", () => {
  let db: pg.Client;
  const run = (args: string[], env: Record<string, string> = {}) => execFileSync(process.execPath, [script, ...args], { env: { ...process.env, DATABASE_URL: url!, MIGRATION_DATABASE_URL: "", PLATFORM_ADMIN_PASSWORD: "", ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
  it("cria o administrador do sistema que ainda não existe, sem lojista, com a senha informada no ambiente", async () => {
    expect(run(["--email=novo@script.test", "--create", "--name=Dono do Sistema"])).toContain("NADA foi alterado");
    expect((await db.query("SELECT 1 FROM users WHERE email='novo@script.test'")).rowCount).toBe(0);
    const output = run(["--email=NOVO@script.test", "--create", "--name=Dono do Sistema", "--apply"], { PLATFORM_ADMIN_PASSWORD: "minha-senha-bem-longa" });
    expect(output).toContain("administrador do sistema criado");
    expect(output).not.toContain("minha-senha-bem-longa");
    const row = (await db.query<{ account_id: string | null; is_platform_admin: boolean; role: string; password_hash: string; name: string }>("SELECT account_id,is_platform_admin,role,password_hash,name FROM users WHERE email='novo@script.test'")).rows[0];
    expect(row).toMatchObject({ account_id: null, is_platform_admin: true, role: "ADMIN", name: "Dono do Sistema" });
    expect(await compare("minha-senha-bem-longa", row.password_hash)).toBe(true);
    expect((await db.query("SELECT 1 FROM audit_logs WHERE action='PLATFORM_ADMIN_CREATE'")).rowCount).toBe(1);
  });

  it("sem senha no ambiente gera uma forte e a mostra uma única vez; ela funciona", async () => {
    const output = run(["--email=gerada@script.test", "--create", "--name=Pessoa Gerada", "--apply"]);
    const shown = /Senha provisória \(aparece só agora, anote\): (\S+)/.exec(output)?.[1];
    expect(shown?.length).toBeGreaterThanOrEqual(18);
    const hash = (await db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE email='gerada@script.test'")).rows[0].password_hash;
    expect(await compare(shown!, hash)).toBe(true);
  });

  it("recusa criar sem nome, com senha curta e não duplica quem já existe: só concede o acesso", async () => {
    expect(() => run(["--email=sem-nome@script.test", "--create", "--apply"])).toThrow(/Informe o nome/);
    expect(() => run(["--email=curta@script.test", "--create", "--name=Curta", "--apply"], { PLATFORM_ADMIN_PASSWORD: "curta" })).toThrow(/pelo menos 10/);
    expect((await db.query("SELECT 1 FROM users WHERE email IN ('sem-nome@script.test','curta@script.test')")).rowCount).toBe(0);
    expect(run(["--email=dono@script.test", "--create", "--name=Outro Nome", "--apply"])).toContain("agora é administrador do sistema");
    expect((await db.query("SELECT 1 FROM users WHERE email='dono@script.test'")).rowCount).toBe(1);
    expect(await flag("dono@script.test")).toBe(true);
  });

  it("redefine a senha de quem esqueceu e derruba as sessões abertas, simulando por padrão", async () => {
    const id = (await db.query<{ id: string }>("SELECT id FROM users WHERE email='so@script.test'")).rows[0].id;
    await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('sessao-script',$1,now()+interval '1 day')", [id]);
    expect(run(["--email=so@script.test", "--reset-password"])).toContain("NADA foi alterado");
    expect((await db.query("SELECT 1 FROM sessions WHERE user_id=$1", [id])).rowCount).toBe(1);
    expect(run(["--email=so@script.test", "--reset-password", "--apply"], { PLATFORM_ADMIN_PASSWORD: "senha-nova-longa-1" })).toContain("senha redefinida");
    const hash = (await db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [id])).rows[0].password_hash;
    expect(await compare("senha-nova-longa-1", hash)).toBe(true);
    expect((await db.query("SELECT 1 FROM sessions WHERE user_id=$1", [id])).rowCount).toBe(0);
  });
});
