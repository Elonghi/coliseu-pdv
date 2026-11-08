import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findLoginUser, loadSessionUser } from "@/modules/auth/session-user";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const script = path.resolve("scripts/migrate.mjs");
const realFolder = path.resolve("drizzle");

suite("login e sessão entre o deploy do código novo e a aplicação das migrations", () => {
  let admin: pg.Client;
  let database = "";
  const folders: string[] = [];
  const urlFor = (name: string) => { const target = new URL(url!); target.pathname = `/${name}`; return target.toString(); };
  const migrate = (folder: string) => execFileSync(process.execPath, [script, "--apply"], { env: { ...process.env, DATABASE_URL: urlFor(database), MIGRATION_DATABASE_URL: "", MIGRATIONS_FOLDER: folder }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const until = (lastIdx: number) => {
    const folder = mkdtempSync(path.join(tmpdir(), "ate-"));
    folders.push(folder);
    cpSync(realFolder, folder, { recursive: true });
    const file = path.join(folder, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(file, "utf8")) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx <= lastIdx);
    writeFileSync(file, JSON.stringify(journal));
    return folder;
  };

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    admin = new pg.Client({ connectionString: urlFor("postgres") });
    await admin.connect();
    database = `coliseu_sesstest_${randomBytes(4).toString("hex")}`;
    await admin.query(`CREATE DATABASE ${database}`);
  });
  afterAll(async () => {
    await admin?.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin?.end();
    for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  });

  it("com o banco ainda sem a coluna nova, o login e a sessão funcionam e ninguém é administrador do sistema; depois da migration, a coluna vale", async () => {
    migrate(until(15));
    const db = new pg.Client({ connectionString: urlFor(database) });
    await db.connect();
    try {
      const account = (await db.query<{ id: string }>("INSERT INTO accounts(name) VALUES ('Lojista') RETURNING id")).rows[0].id;
      const store = (await db.query<{ id: string }>("INSERT INTO stores(account_id,name) VALUES ($1,'Loja') RETURNING id", [account])).rows[0].id;
      const user = (await db.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id,is_account_owner) VALUES ('Titular','t@sess.test','x','ADMIN',$1,true) RETURNING id", [account])).rows[0].id;
      await db.query("INSERT INTO user_stores(user_id,store_id) VALUES ($1,$2)", [user, store]);
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('hash-sessao',$1,now()+interval '1 day')", [user]);
      expect((await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_platform_admin'")).rowCount).toBe(0);

      const antes = await loadSessionUser(db, "hash-sessao");
      expect(antes).toMatchObject({ email: "t@sess.test", isPlatformAdmin: false, isAccountOwner: true });
      expect(antes?.stores.map((item) => item.name)).toEqual(["Loja"]);
      expect(await findLoginUser(db, "t@sess.test")).toMatchObject({ id: user, is_platform_admin: false });
      expect(await findLoginUser(db, "ninguem@sess.test")).toBeNull();

      migrate(realFolder);
      await db.query("UPDATE users SET is_platform_admin=true WHERE id=$1", [user]);
      expect(await loadSessionUser(db, "hash-sessao")).toMatchObject({ isPlatformAdmin: true });
      expect(await findLoginUser(db, "t@sess.test")).toMatchObject({ is_platform_admin: true });
    } finally { await db.end(); }
  });

  it("outros erros do banco não são engolidos", async () => {
    const db = new pg.Client({ connectionString: urlFor("postgres") });
    await db.connect();
    try { await expect(loadSessionUser(db, "x")).rejects.toThrow(/relation "sessions" does not exist/); } finally { await db.end(); }
  });
});
