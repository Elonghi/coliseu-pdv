import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const script = path.resolve("scripts/migrate.mjs");
const realFolder = path.resolve("drizzle");
const journal = (folder: string) => JSON.parse(readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as { entries: { idx: number; when: number; tag: string }[] };

suite("executor de migrations para o terminal do app", () => {
  let admin: pg.Client;
  const created: string[] = [];
  const folders: string[] = [];
  const urlFor = (database: string) => { const target = new URL(url!); target.pathname = `/${database}`; return target.toString(); };
  const newDatabase = async () => {
    const name = `coliseu_migtest_${randomBytes(4).toString("hex")}`;
    await admin.query(`CREATE DATABASE ${name}`);
    created.push(name);
    return name;
  };
  const run = (database: string, args: string[] = [], env: Record<string, string> = {}) =>
    execFileSync(process.execPath, [script, ...args], { env: { ...process.env, DATABASE_URL: urlFor(database), MIGRATION_DATABASE_URL: "", MIGRATIONS_FOLDER: realFolder, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const query = async <T extends pg.QueryResultRow>(database: string, sql: string) => {
    const client = new pg.Client({ connectionString: urlFor(database) });
    await client.connect();
    try { return (await client.query<T>(sql)).rows; } finally { await client.end(); }
  };
  const copyFolder = (entries?: number) => {
    const folder = mkdtempSync(path.join(tmpdir(), "migracoes-"));
    folders.push(folder);
    cpSync(realFolder, folder, { recursive: true });
    if (entries !== undefined) {
      const file = path.join(folder, "meta", "_journal.json");
      const data = journal(folder);
      data.entries = data.entries.slice(0, entries);
      writeFileSync(file, JSON.stringify(data));
    }
    return folder;
  };
  const rows = (database: string) => query<{ hash: string; created_at: string }>(database, "SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id");

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    admin = new pg.Client({ connectionString: urlFor("postgres") });
    await admin.connect();
  });
  afterAll(async () => {
    for (const name of created) await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin?.end();
    for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  });

  it("sem --apply só consulta: lista as pendentes e não cria nada", async () => {
    const database = await newDatabase();
    const output = run(database);
    expect(output).toContain("CONSULTA");
    expect(output).toContain(`pendentes: ${journal(realFolder).entries.length}`);
    expect(output).toContain("NADA foi alterado");
    expect((await query<{ ok: boolean }>(database, "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok"))[0].ok).toBe(false);
    expect((await query<{ ok: boolean }>(database, "SELECT to_regclass('public.users') IS NOT NULL AS ok"))[0].ok).toBe(false);
  });

  it("com --apply aplica tudo e é idêntico ao migrador do Drizzle (mesmos hashes e datas)", async () => {
    const mine = await newDatabase();
    expect(run(mine, ["--apply"])).toContain("Migrations aplicadas.");
    expect((await query<{ ok: boolean }>(mine, "SELECT to_regclass('public.users') IS NOT NULL AS ok"))[0].ok).toBe(true);

    const reference = await newDatabase();
    const pool = new pg.Pool({ connectionString: urlFor(reference) });
    await migrate(drizzle(pool), { migrationsFolder: realFolder });
    await pool.end();

    expect(await rows(mine)).toEqual(await rows(reference));
    expect((await rows(mine))).toHaveLength(journal(realFolder).entries.length);
  });

  it("é intercambiável: banco do Drizzle não tem pendência, e banco do script não é reaplicado pelo Drizzle", async () => {
    const byDrizzle = await newDatabase();
    const pool = new pg.Pool({ connectionString: urlFor(byDrizzle) });
    await migrate(drizzle(pool), { migrationsFolder: realFolder });
    await pool.end();
    expect(run(byDrizzle, ["--apply"])).toContain("Nenhuma migration pendente.");

    const byScript = await newDatabase();
    run(byScript, ["--apply"]);
    const before = await rows(byScript);
    const pool2 = new pg.Pool({ connectionString: urlFor(byScript) });
    await migrate(drizzle(pool2), { migrationsFolder: realFolder });
    await pool2.end();
    expect(await rows(byScript)).toEqual(before);
    expect(run(byScript)).toContain("Nenhuma migration pendente.");
  });

  it("aplica somente as pendentes sobre um banco já migrado até a anterior, preservando os dados", async () => {
    const database = await newDatabase();
    const total = journal(realFolder).entries.length;
    run(database, ["--apply"], { MIGRATIONS_FOLDER: copyFolder(total - 1) });
    await query(database, "INSERT INTO users (name,email,password_hash,role,created_at) VALUES ('Dono','dono@x.test','x','ADMIN','2026-01-01')");

    const lastTag = journal(realFolder).entries[total - 1].tag;
    const consulta = run(database);
    expect(consulta).toContain("pendentes: 1");
    expect(consulta).toContain(`pendente: ${lastTag}`);
    const output = run(database, ["--apply"]);
    expect(output).toContain(`aplicada: ${lastTag}`);
    expect((await rows(database))).toHaveLength(total);
    expect((await query(database, "SELECT email FROM users")).map((row) => row.email)).toEqual(["dono@x.test"]);
  });

  it("é atômico: uma migration com erro não grava nada, nem o que veio antes dela na mesma execução", async () => {
    const database = await newDatabase();
    run(database, ["--apply"]);
    const folder = copyFolder();
    const data = journal(folder);
    const when = Math.max(...data.entries.map((entry) => entry.when));
    writeFileSync(path.join(folder, "9998_boa.sql"), "CREATE TABLE zz_boa (id int);");
    writeFileSync(path.join(folder, "9999_ruim.sql"), "CREATE TABLE zz_ruim (id int);--> statement-breakpoint\nSELECT 1/0;");
    data.entries.push({ idx: 9998, when: when + 1, tag: "9998_boa" }, { idx: 9999, when: when + 2, tag: "9999_ruim" });
    writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify(data));

    const before = await rows(database);
    expect(() => run(database, ["--apply"], { MIGRATIONS_FOLDER: folder })).toThrow(/nenhuma alteração foi gravada/);
    expect(await rows(database)).toEqual(before);
    const tables = await query<{ name: string }>(database, "SELECT table_name AS name FROM information_schema.tables WHERE table_name IN ('zz_boa','zz_ruim')");
    expect(tables).toEqual([]);
  });

  it("exige a URL do banco e usa MIGRATION_DATABASE_URL quando informada", async () => {
    expect(() => execFileSync(process.execPath, [script], { env: { ...process.env, DATABASE_URL: "", MIGRATION_DATABASE_URL: "" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).toThrow(/DATABASE_URL não está configurada/);
    const database = await newDatabase();
    const output = run(database, [], { DATABASE_URL: "postgres://inexistente:x@127.0.0.1:1/nada", MIGRATION_DATABASE_URL: urlFor(database) });
    expect(output).toContain(database);
  });
});
