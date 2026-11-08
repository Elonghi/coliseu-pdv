import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { compare } from "bcryptjs";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const role = "coliseu_platform_test";

suite("painel do sistema, com o app conectado como o papel sem privilégio", () => {
  let owner: pg.Client;
  let service: typeof import("@/modules/platform/service");
  let adminId: string;
  const password = randomBytes(27).toString("base64url");
  const one = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await owner.query<T>(sql, params)).rows[0];
  const newAccount = (overrides: Record<string, unknown> = {}) => service.asPlatform(() => service.createAccount({
    name: "Arena Dragão", ownerName: "Titular Dragão", ownerEmail: "titular@dragao.test", ownerPassword: "senha-provisoria-1", storeName: "Loja Centro", storeCnpj: "12.345.678/0001-99", ...overrides,
  }, adminId));

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    owner = new pg.Client({ connectionString: url });
    await owner.connect();
    execFileSync(process.execPath, [path.resolve("scripts/create-app-role.mjs")], { env: { ...process.env, DATABASE_URL: url!, APP_DB_ROLE: role, APP_DB_PASSWORD: password }, stdio: "pipe" });
    const target = new URL(url); target.username = role; target.password = password;
    process.env.DATABASE_URL = url;
    process.env.APP_DATABASE_URL = target.toString();
    service = await import("@/modules/platform/service");
  });
  afterAll(async () => {
    const { pool } = await import("@/db");
    await pool.end();
    await owner?.query(`DROP OWNED BY ${role}`).catch(() => undefined);
    await owner?.query(`DROP ROLE IF EXISTS ${role}`);
    await owner?.end();
  });
  beforeEach(async () => {
    await resetTenancy(owner);
    adminId = (await one<{ id: string }>("INSERT INTO users(name,email,password_hash,role,is_platform_admin) VALUES ('Dono do sistema','dono@sistema.test','x','ADMIN',true) RETURNING id")).id;
    await owner.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('PIX','PIX',1) ON CONFLICT DO NOTHING");
  });

  it("cria o lojista com a primeira loja e o titular, que enxerga a loja e já tem as formas de pagamento", async () => {
    const account = await newAccount();
    const row = await one<{ name: string; max_stores: number | null }>("SELECT name,max_stores FROM accounts WHERE id=$1", [account]);
    expect(row).toEqual({ name: "Arena Dragão", max_stores: null });
    const store = await one<{ id: string; cnpj: string }>("SELECT id,cnpj FROM stores WHERE account_id=$1", [account]);
    expect(store.cnpj).toBe("12345678000199");
    const titular = await one<{ id: string; is_account_owner: boolean; role: string; password_hash: string }>("SELECT id,is_account_owner,role,password_hash FROM users WHERE email='titular@dragao.test'");
    expect(titular).toMatchObject({ is_account_owner: true, role: "ADMIN" });
    expect(await compare("senha-provisoria-1", titular.password_hash)).toBe(true);
    expect((await owner.query("SELECT 1 FROM user_stores WHERE user_id=$1 AND store_id=$2", [titular.id, store.id])).rowCount).toBe(1);
    expect((await owner.query("SELECT 1 FROM store_payment_methods WHERE store_id=$1 AND code='PIX' AND active", [store.id])).rowCount).toBe(1);
    expect((await one<{ n: number }>("SELECT count(*)::int n FROM audit_logs WHERE action='PLATFORM_ACCOUNT_CREATE' AND account_id=$1", [account])).n).toBe(1);
  });

  it("recusa dados inválidos e e-mail repetido, sem criar nada pela metade", async () => {
    await expect(newAccount({ ownerEmail: "sem-arroba" })).rejects.toThrow(/E-mail do titular inválido/);
    await expect(newAccount({ ownerPassword: "curta" })).rejects.toThrow(/pelo menos 10/);
    await expect(newAccount({ storeCnpj: "123" })).rejects.toThrow(/CNPJ inválido/);
    await newAccount();
    await expect(newAccount({ name: "Outro nome", storeName: "Outra loja" })).rejects.toThrow(/duplicate key|users_email/);
    expect((await one<{ n: number }>("SELECT count(*)::int n FROM accounts")).n).toBe(2);
  });

  it("adiciona lojas até o limite do lojista", async () => {
    const account = await newAccount({ maxStores: 2 });
    await service.asPlatform(() => service.addStore(account, { name: "Loja Shopping", cnpj: "" }, adminId));
    await expect(service.asPlatform(() => service.addStore(account, { name: "Loja Norte", cnpj: "" }, adminId))).rejects.toThrow(/no limite de 2 loja/);
    await service.asPlatform(() => service.updateAccount(account, { name: "Arena Dragão", notes: "", maxStores: 3 }, adminId));
    await service.asPlatform(() => service.addStore(account, { name: "Loja Norte", cnpj: "" }, adminId));
    expect((await one<{ n: number }>("SELECT count(*)::int n FROM stores WHERE account_id=$1", [account])).n).toBe(3);
    await expect(service.asPlatform(() => service.updateAccount(account, { name: "Arena Dragão", notes: "", maxStores: 2 }, adminId))).rejects.toThrow(/não pode ser menor/);
  });

  it("a loja nova nasce com as formas de pagamento e o titular já enxerga todas as lojas", async () => {
    const account = await newAccount();
    const store = await service.asPlatform(() => service.addStore(account, { name: "Loja Shopping", cnpj: "" }, adminId));
    expect((await owner.query("SELECT 1 FROM store_payment_methods WHERE store_id=$1 AND code='PIX'", [store])).rowCount).toBe(1);
    const { listAccessibleStores } = await import("@/modules/auth/stores");
    const titular = (await one<{ id: string }>("SELECT id FROM users WHERE email='titular@dragao.test'")).id;
    expect((await listAccessibleStores(owner, titular)).map((item) => item.name)).toEqual(["Loja Centro", "Loja Shopping"]);
  });

  it("suspender derruba as sessões e impede o login; reativar libera", async () => {
    const account = await newAccount();
    const titular = (await one<{ id: string }>("SELECT id FROM users WHERE email='titular@dragao.test'")).id;
    await owner.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('sessao-1',$1,now()+interval '1 day')", [titular]);
    await service.asPlatform(() => service.setAccountActive(account, false, adminId));
    expect((await owner.query("SELECT 1 FROM sessions WHERE user_id=$1", [titular])).rowCount).toBe(0);
    const login = "SELECT u.id FROM users u LEFT JOIN accounts a ON a.id=u.account_id WHERE lower(u.email)=$1 AND u.active=true AND (u.account_id IS NULL OR a.active)";
    expect((await owner.query(login, ["titular@dragao.test"])).rowCount).toBe(0);
    await service.asPlatform(() => service.setAccountActive(account, true, adminId));
    expect((await owner.query(login, ["titular@dragao.test"])).rowCount).toBe(1);
  });

  it("redefine a senha do titular, desliga o 2FA e derruba as sessões", async () => {
    const account = await newAccount();
    const titular = (await one<{ id: string }>("SELECT id FROM users WHERE email='titular@dragao.test'")).id;
    await owner.query("UPDATE users SET totp_enabled=true,totp_secret_encrypted='x' WHERE id=$1", [titular]);
    await owner.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('sessao-2',$1,now()+interval '1 day')", [titular]);
    await service.asPlatform(() => service.resetOwnerPassword(account, "nova-senha-provisoria", adminId));
    const row = await one<{ password_hash: string; totp_enabled: boolean }>("SELECT password_hash,totp_enabled FROM users WHERE id=$1", [titular]);
    expect(await compare("nova-senha-provisoria", row.password_hash)).toBe(true);
    expect(row.totp_enabled).toBe(false);
    expect((await owner.query("SELECT 1 FROM sessions WHERE user_id=$1", [titular])).rowCount).toBe(0);
    await expect(service.asPlatform(() => service.resetOwnerPassword(account, "curta", adminId))).rejects.toThrow(/pelo menos 10/);
  });

  it("o administrador do sistema vê lojistas, lojas e equipe, mas nunca os dados do negócio deles", async () => {
    const account = await newAccount();
    const store = (await one<{ id: string }>("SELECT id FROM stores WHERE account_id=$1", [account])).id;
    await owner.query("INSERT INTO cash_registers(name,store_id) VALUES ('Caixa do lojista',$1)", [store]);
    const { pool } = await import("@/db");
    await service.asPlatform(async () => {
      expect((await pool.query("SELECT count(*)::int n FROM cash_registers")).rows[0].n).toBe(0);
      expect((await service.listAccounts()).map((row) => row.name)).toContain("Arena Dragão");
      const detail = await service.getAccount(account);
      expect(detail?.stores).toHaveLength(1);
      expect(detail?.team.map((person) => person.email)).toEqual(["titular@dragao.test"]);
    });
  });
});
