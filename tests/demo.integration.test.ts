import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { compare } from "bcryptjs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoCatalog, demoEan, ean13Digit } from "@/modules/platform/demo-data";
import { resetTenancy } from "./fixtures/tenancy";

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const role = "coliseu_demo_test";

suite("cliente de demonstração, criado pelo sistema com as travas do banco valendo", () => {
  let owner: pg.Client;
  let demo: Awaited<ReturnType<typeof import("@/modules/platform/demo").createDemoAccount>>;
  let outraConta: string; let outraLoja: string; let platformAdmin: string;
  const password = randomBytes(27).toString("base64url");
  const demoPassword = "senha-demonstracao-26";
  const one = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await owner.query<T>(sql, params)).rows[0];
  const total = async (sql: string, params: unknown[] = []) => (await one<{ n: number }>(`SELECT count(*)::int n FROM (${sql}) q`, params)).n;

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    owner = new pg.Client({ connectionString: url });
    await owner.connect();
    execFileSync(process.execPath, [path.resolve("scripts/create-app-role.mjs")], { env: { ...process.env, DATABASE_URL: url!, APP_DB_ROLE: role, APP_DB_PASSWORD: password }, stdio: "pipe" });
    const target = new URL(url); target.username = role; target.password = password;
    process.env.DATABASE_URL = url;
    process.env.APP_DATABASE_URL = target.toString();

    await resetTenancy(owner);
    outraConta = (await one<{ id: string }>("SELECT id FROM accounts")).id;
    outraLoja = (await one<{ id: string }>("SELECT id FROM stores")).id;
    await owner.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('CASH','Dinheiro',0),('PIX','PIX',1),('DEBIT_CARD','Débito',2),('CREDIT_CARD','Crédito',3),('PLAYER_CREDIT','Crédito do jogador',4),('FUTURE','Pagamento futuro',5) ON CONFLICT DO NOTHING");
    platformAdmin = (await one<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id,is_platform_admin) VALUES ('Dono do sistema','dono@demo.test','x','ADMIN',NULL,true) RETURNING id")).id;
    const { createDemoAccount } = await import("@/modules/platform/demo");
    demo = await createDemoAccount({ ownerEmail: "Apresentacao@Coliseon.test", password: demoPassword }, platformAdmin);
  }, 240_000);
  afterAll(async () => {
    const { pool } = await import("@/db");
    await pool.end();
    await owner?.query(`DROP OWNED BY ${role}`).catch(() => undefined);
    await owner?.query(`DROP ROLE IF EXISTS ${role}`);
    await owner?.end();
  });

  it("cria o lojista de demonstração com duas lojas, o titular e a equipe, todos com a mesma senha", async () => {
    expect(demo.counts.stores).toBe(2);
    expect(demo.logins.map((login) => login.email)).toEqual(["apresentacao@coliseon.test", "apresentacao+gerente-shopping@coliseon.test", "apresentacao+caixa-centro@coliseon.test", "apresentacao+caixa-shopping@coliseon.test"]);
    const rows = (await owner.query<{ email: string; password_hash: string; role: string; is_account_owner: boolean }>("SELECT email,password_hash,role,is_account_owner FROM users WHERE account_id=$1 ORDER BY created_at", [demo.accountId])).rows;
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(await compare(demoPassword, row.password_hash)).toBe(true);
    expect(rows.filter((row) => row.is_account_owner)).toHaveLength(1);
    expect(rows.map((row) => row.role).sort()).toEqual(["ADMIN", "ADMIN", "OPERATOR", "OPERATOR"]);
    expect((await one<{ notes: string }>("SELECT notes FROM accounts WHERE id=$1", [demo.accountId])).notes).toMatch(/demonstração/);
  });

  it("o titular vê as duas lojas, o gerente só a Shopping e cada caixa só a sua", async () => {
    const { listAccessibleStores } = await import("@/modules/auth/stores");
    const ids = async (email: string) => (await one<{ id: string }>("SELECT id FROM users WHERE email=$1", [email])).id;
    const names = async (email: string) => (await listAccessibleStores(owner, await ids(email))).map((store) => store.name);
    expect(await names("apresentacao@coliseon.test")).toEqual(["Loja Centro", "Loja Shopping"]);
    expect(await names("apresentacao+gerente-shopping@coliseon.test")).toEqual(["Loja Shopping"]);
    expect(await names("apresentacao+caixa-centro@coliseon.test")).toEqual(["Loja Centro"]);
    expect(await names("apresentacao+caixa-shopping@coliseon.test")).toEqual(["Loja Shopping"]);
  });

  it("catálogo pronto para as etiquetas: produtos ativos com EAN-13 válido, em cinco categorias", async () => {
    const products = (await owner.query<{ sku: string; barcode: string; active: boolean }>("SELECT sku,barcode,active FROM products WHERE account_id=$1", [demo.accountId])).rows;
    expect(products).toHaveLength(demoCatalog.length);
    for (const product of products) { expect(product.active).toBe(true); expect(ean13Digit(product.barcode.slice(0, 12))).toBe(product.barcode[12]); }
    expect(products.map((product) => product.barcode)).toContain(demoEan(1));
    expect(await total("SELECT id FROM categories WHERE account_id=$1", [demo.accountId])).toBe(5);
    expect(await total("SELECT id FROM players WHERE account_id=$1", [demo.accountId])).toBe(8);
    expect(await total("SELECT id FROM suppliers WHERE account_id=$1", [demo.accountId])).toBe(2);
  });

  it("quatro semanas de vendas de verdade nas duas lojas, sem nenhuma venda recusada e sem datas no futuro", async () => {
    expect(demo.failures).toEqual([]);
    expect(demo.counts.failedSales).toBe(0);
    const perStore = (await owner.query<{ name: string; vendas: number; dias: number; primeira: Date; ultima: Date }>(`SELECT st.name,count(*)::int vendas,count(DISTINCT s.created_at::date)::int dias,min(s.created_at) primeira,max(s.created_at) ultima
      FROM sales s JOIN stores st ON st.id=s.store_id WHERE st.account_id=$1 GROUP BY st.name ORDER BY st.name`, [demo.accountId])).rows;
    expect(perStore.map((row) => row.name)).toEqual(["Loja Centro", "Loja Shopping"]);
    for (const row of perStore) {
      expect(row.vendas).toBeGreaterThanOrEqual(30);
      expect(row.dias).toBeGreaterThanOrEqual(20);
      expect(row.ultima.getTime()).toBeLessThanOrEqual(Date.now() + 3_600_000);
      expect(Date.now() - row.primeira.getTime()).toBeLessThan(31 * 86_400_000);
    }
    expect(demo.counts.sales).toBe(perStore.reduce((sum, row) => sum + row.vendas, 0));
    const methods = (await owner.query<{ method_code: string }>("SELECT DISTINCT p.method_code FROM payments p JOIN sales s ON s.id=p.sale_id JOIN stores st ON st.id=s.store_id WHERE st.account_id=$1", [demo.accountId])).rows.map((row) => row.method_code);
    expect(methods).toEqual(expect.arrayContaining(["PIX", "CASH"]));
    expect(await total("SELECT s.id FROM sales s JOIN stores st ON st.id=s.store_id WHERE st.account_id=$1 AND s.status='CANCELED'", [demo.accountId])).toBe(4);
    expect(await total("SELECT cs.id FROM cash_sessions cs JOIN stores st ON st.id=cs.store_id WHERE st.account_id=$1 AND cs.status='OPEN'", [demo.accountId])).toBe(2);
  });

  it("notas fiscais de compra: uma entrada completa, uma com falta registrada e uma por dar entrada, em cada loja", async () => {
    expect(demo.counts.invoices).toBe(6);
    const rows = (await owner.query<{ store: string; entradas: number; faltas: number; pendentes: number }>(`SELECT st.name store,
      count(*) FILTER (WHERE i.stock_imported_at IS NOT NULL)::int entradas,
      count(*) FILTER (WHERE i.stock_import_error LIKE 'Falta registrada%')::int faltas,
      count(*) FILTER (WHERE i.stock_imported_at IS NULL AND i.stock_import_error IS NULL)::int pendentes
      FROM fiscal_invoice_items i JOIN fiscal_invoices f ON f.id=i.invoice_id JOIN stores st ON st.id=f.store_id WHERE st.account_id=$1 GROUP BY st.name ORDER BY st.name`, [demo.accountId])).rows;
    for (const row of rows) { expect(row.entradas).toBeGreaterThan(20); expect(row.faltas).toBe(1); expect(row.pendentes).toBeGreaterThan(5); }
    expect(await total("SELECT f.id FROM fiscal_invoices f JOIN stores st ON st.id=f.store_id WHERE st.account_id=$1 AND f.recipient_cnpj_cpf=st.cnpj", [demo.accountId])).toBe(6);
  });

  it("financeiro: duplicatas das notas a pagar (uma vencida sem pagar, outras em dia ou pagas) e recebíveis das vendas no fiado", async () => {
    const payable = (await owner.query<{ pagas: number; vencidas: number; abertas: number }>(`SELECT
      count(*) FILTER (WHERE i.status='SETTLED')::int pagas,
      count(*) FILTER (WHERE i.status IN ('OPEN','PARTIAL') AND i.due_date < current_date)::int vencidas,
      count(*) FILTER (WHERE i.status IN ('OPEN','PARTIAL') AND i.due_date >= current_date)::int abertas
      FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id JOIN stores st ON st.id=a.store_id WHERE st.account_id=$1 AND a.type='PAYABLE'`, [demo.accountId])).rows[0];
    expect(payable.pagas).toBe(2);
    expect(payable.vencidas).toBeGreaterThanOrEqual(2);
    expect(payable.abertas).toBeGreaterThanOrEqual(4);
    expect(demo.counts.payables).toBe(10);
  });

  it("estoque por loja, sem saldo negativo, com produto abaixo do mínimo e pedido de compra enviado em cada loja", async () => {
    const stock = (await owner.query<{ store: string; unidades: number; produtos: number }>(`SELECT st.name store,sum(ps.quantity)::int unidades,count(*) FILTER (WHERE ps.quantity>0)::int produtos
      FROM product_stock ps JOIN stores st ON st.id=ps.store_id WHERE st.account_id=$1 GROUP BY st.name ORDER BY st.name`, [demo.accountId])).rows;
    expect(stock).toHaveLength(2);
    for (const row of stock) { expect(row.unidades).toBeGreaterThan(200); expect(row.produtos).toBeGreaterThanOrEqual(15); }
    expect(await total("SELECT po.id FROM purchase_orders po JOIN stores st ON st.id=po.store_id WHERE st.account_id=$1 AND po.status='SENT'", [demo.accountId])).toBe(2);
  });

  it("os dados da demonstração ficam isolados: outro lojista e o administrador do sistema não veem nada deles", async () => {
    const { pool } = await import("@/db");
    const { runWithScope } = await import("@/db/scope");
    await runWithScope({ accountId: outraConta, storeId: outraLoja, storeIds: [outraLoja] }, async () => {
      for (const table of ["products", "sales", "fiscal_invoices", "players", "financial_accounts", "product_stock"]) {
        expect((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, table).toBe(0);
      }
    });
    await runWithScope({ accountId: null, storeId: null, storeIds: [], platform: true }, async () => {
      expect((await pool.query("SELECT count(*)::int n FROM sales")).rows[0].n).toBe(0);
      expect((await pool.query("SELECT count(*)::int n FROM accounts")).rows[0].n).toBe(2);
    });
  });

  it("repetir o e-mail do titular é recusado sem deixar um lojista pela metade", async () => {
    const { createDemoAccount } = await import("@/modules/platform/demo");
    const before = await total("SELECT id FROM accounts");
    await expect(createDemoAccount({ ownerEmail: "apresentacao@coliseon.test", password: demoPassword }, platformAdmin)).rejects.toThrow(/duplicate key|users_email/);
    expect(await total("SELECT id FROM accounts")).toBe(before);
  });

  it("duas demonstrações convivem: cada uma com os seus CNPJs e os seus dados, sem se enxergarem", async () => {
    const { createDemoAccount } = await import("@/modules/platform/demo");
    const second = await createDemoAccount({ ownerEmail: "segunda@coliseon.test", password: demoPassword, name: "Segunda demonstração", seed: 7 }, platformAdmin);
    expect(second.failures).toEqual([]);
    expect(await total("SELECT DISTINCT cnpj FROM stores WHERE account_id IN ($1,$2)", [demo.accountId, second.accountId])).toBe(4);
    expect(await total("SELECT DISTINCT company_cnpj FROM sefaz_sync_states")).toBe(4);
    const { pool } = await import("@/db");
    const { runWithScope } = await import("@/db/scope");
    const stores = (await owner.query<{ id: string }>("SELECT id FROM stores WHERE account_id=$1", [second.accountId])).rows.map((row) => row.id);
    await runWithScope({ accountId: second.accountId, storeId: null, storeIds: stores }, async () => {
      expect((await pool.query("SELECT count(*)::int n FROM sales")).rows[0].n).toBe(second.counts.sales);
      expect((await pool.query("SELECT count(*)::int n FROM products")).rows[0].n).toBe(demoCatalog.length);
    });
  }, 120_000);
});
