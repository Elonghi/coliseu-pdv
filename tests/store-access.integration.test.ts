import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessibleStoresJson, attachUserToAccount, listAccessibleStores, ownerProtectionError } from "@/modules/auth/stores";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));

suite("acesso às lojas da conta", () => {
  let db: pg.Client;
  let accountA: string; let accountB: string;
  let centro: string; let shopping: string; let outraConta: string;
  const user = async (email: string, options: { account?: string | null; owner?: boolean } = {}) => {
    const account = options.account === undefined ? accountA : options.account;
    return (await db.query<{ id: string }>("INSERT INTO users (name,email,password_hash,role,account_id,is_account_owner,is_platform_admin) VALUES ($1,$2,'x','OPERATOR',$3::uuid,$4,($3::uuid IS NULL)) RETURNING id", [email, `${email}@loja.test`, account, options.owner ?? false])).rows[0].id;
  };
  const links = async (userId: string) => (await db.query<{ name: string }>("SELECT s.name FROM user_stores us JOIN stores s ON s.id=us.store_id WHERE us.user_id=$1 ORDER BY s.name", [userId])).rows.map((row) => row.name);

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    db = new pg.Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("TRUNCATE accounts,stores,user_stores,users RESTART IDENTITY CASCADE");
    accountA = (await db.query<{ id: string }>("INSERT INTO accounts (name) VALUES ('Conta A') RETURNING id")).rows[0].id;
    accountB = (await db.query<{ id: string }>("INSERT INTO accounts (name) VALUES ('Conta B') RETURNING id")).rows[0].id;
    centro = (await db.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Centro') RETURNING id", [accountA])).rows[0].id;
    shopping = (await db.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Shopping') RETURNING id", [accountA])).rows[0].id;
    outraConta = (await db.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja da outra conta') RETURNING id", [accountB])).rows[0].id;
  });

  it("o lojista enxerga todas as lojas ativas dele, e só as dele", async () => {
    const owner = await user("dono", { owner: true });
    await db.query("INSERT INTO stores (account_id,name,active) VALUES ($1,'Fechada',false)", [accountA]);
    expect((await listAccessibleStores(db, owner)).map((store) => store.name)).toEqual(["Centro", "Shopping"]);
  });

  it("os demais só enxergam as lojas que foram liberadas a eles", async () => {
    const operator = await user("caixa");
    expect(await listAccessibleStores(db, operator)).toEqual([]);
    await db.query("INSERT INTO user_stores (user_id,store_id) VALUES ($1,$2)", [operator, shopping]);
    expect((await listAccessibleStores(db, operator)).map((store) => store.name)).toEqual(["Shopping"]);
  });

  it("não vaza loja de outra conta, mesmo se o vínculo for forçado", async () => {
    const operator = await user("caixa");
    await db.query("INSERT INTO user_stores (user_id,store_id) VALUES ($1,$2)", [operator, outraConta]);
    expect(await listAccessibleStores(db, operator)).toEqual([]);
    expect(await listAccessibleStores(db, await user("sem-conta", { account: null }))).toEqual([]);
  });

  it("a consulta da sessão usa o mesmo trecho e devolve JSON utilizável", async () => {
    const owner = await user("dono", { owner: true });
    const row = (await db.query<{ stores: { id: string; name: string }[] }>(`SELECT ${accessibleStoresJson} AS stores FROM users u WHERE u.id=$1`, [owner])).rows[0];
    expect(row.stores).toEqual([{ id: centro, name: "Centro" }, { id: shopping, name: "Shopping" }]);
  });

  it("vincula o usuário novo ao lojista e às lojas de quem o criou, ignorando loja de outra conta", async () => {
    const created = await user("novo", { account: null });
    await attachUserToAccount(db, created, accountA, [centro, outraConta]);
    expect((await db.query("SELECT account_id FROM users WHERE id=$1", [created])).rows[0].account_id).toBe(accountA);
    expect(await links(created)).toEqual(["Centro"]);
    await attachUserToAccount(db, created, accountA, [centro, shopping]);
    expect(await links(created)).toEqual(["Centro", "Shopping"]);
  });

  it("não move para outra conta um usuário que já pertence a uma conta", async () => {
    const existing = await user("existente", { account: accountB });
    await attachUserToAccount(db, existing, accountA, [centro]);
    expect((await db.query("SELECT account_id FROM users WHERE id=$1", [existing])).rows[0].account_id).toBe(accountB);
    expect(await links(existing)).toEqual([]);
  });

  it("protege o lojista titular contra rebaixamento e desativação", () => {
    expect(ownerProtectionError({ isAccountOwner: true }, { role: "OPERATOR", active: true })).toMatch(/lojista/);
    expect(ownerProtectionError({ isAccountOwner: true }, { role: "ADMIN", active: false })).toMatch(/lojista/);
    expect(ownerProtectionError({ isAccountOwner: true }, { role: "ADMIN", active: true })).toBeNull();
    expect(ownerProtectionError({ isAccountOwner: false }, { role: "OPERATOR", active: false })).toBeNull();
  });
});
