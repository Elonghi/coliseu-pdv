import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const script = path.resolve("scripts/create-app-role.mjs");
const role = "coliseu_app_test";
const probeTable = "zz_app_role_probe";

suite("papel de banco sem privilégio para a aplicação", () => {
  let owner: pg.Client;
  const password = randomBytes(27).toString("base64url");
  const run = (env: Record<string, string>) => execFileSync(process.execPath, [script], { env: { ...process.env, DATABASE_URL: url!, APP_DB_ROLE: role, APP_DB_PASSWORD: password, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const asApp = async (secret = password) => {
    const target = new URL(url!);
    target.username = role;
    target.password = secret;
    const client = new pg.Client({ connectionString: target.toString() });
    await client.connect();
    return client;
  };

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    owner = new pg.Client({ connectionString: url });
    await owner.connect();
    await owner.query(`DROP TABLE IF EXISTS ${probeTable}`);
  });
  afterAll(async () => {
    await owner?.query(`DROP TABLE IF EXISTS ${probeTable}`);
    await owner?.query(`DROP OWNED BY ${role}`).catch(() => undefined);
    await owner?.query(`DROP ROLE IF EXISTS ${role}`);
    await owner?.end();
  });

  it("recusa senha fraca ou papel igual ao dono, sem criar nada", async () => {
    expect(() => run({ APP_DB_PASSWORD: "curta" })).toThrow(/24 ou mais caracteres/);
    expect(() => run({ APP_DB_ROLE: "Papel Inválido" })).toThrow(/APP_DB_ROLE inválido/);
    expect(() => run({ APP_DB_ROLE: new URL(url!).username })).toThrow(/mesmo usuário/);
    expect((await owner.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount).toBe(0);
  });

  it("cria o papel sem superusuário, sem ignorar RLS e sem imprimir a senha", async () => {
    const output = run({});
    expect(output).toContain(`Papel "${role}" criado`);
    expect(output).not.toContain(password);
    const flags = (await owner.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=$1", [role])).rows[0];
    expect(flags).toEqual({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false });
  });

  it("lê e escreve nas tabelas de dados, mas não altera o esquema nem lê o controle de migrações", async () => {
    const app = await asApp();
    try {
      expect((await app.query("SELECT current_user AS name")).rows[0].name).toBe(role);
      await app.query("SELECT count(*) FROM products");
      // o app trava `users` ao criar administradores (modules/admin/actions.ts)
      await app.query("BEGIN");
      await app.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
      await app.query("COMMIT");
      await expect(app.query("CREATE TABLE zz_nao_pode (id int)")).rejects.toThrow(/permission denied/);
      await expect(app.query("ALTER TABLE products ADD COLUMN zz_nao_pode int")).rejects.toThrow(/must be owner/);
      await expect(app.query("TRUNCATE products")).rejects.toThrow(/permission denied/);
      await app.query("SELECT count(*) FROM drizzle.__drizzle_migrations");
      await expect(app.query("INSERT INTO drizzle.__drizzle_migrations (hash,created_at) VALUES ('x',1)")).rejects.toThrow(/permission denied/);
    } finally {
      await app.end();
    }
  });

  it("cobre tabelas criadas depois (migrações futuras), repete sem erro e troca a senha", async () => {
    await owner.query(`CREATE TABLE ${probeTable} (id serial PRIMARY KEY, name text)`);
    const app = await asApp();
    try {
      await app.query(`INSERT INTO ${probeTable} (name) VALUES ('ok')`);
      expect((await app.query(`SELECT name FROM ${probeTable}`)).rows[0].name).toBe("ok");
    } finally {
      await app.end();
    }

    const rotated = randomBytes(27).toString("base64url");
    expect(run({ APP_DB_PASSWORD: rotated })).toContain("atualizado");
    await expect(asApp(password)).rejects.toThrow(/password authentication failed/);
    const app2 = await asApp(rotated);
    await app2.end();
  });
});
