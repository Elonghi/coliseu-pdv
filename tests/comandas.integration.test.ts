import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTenancy } from "./fixtures/tenancy";

/* O app fala com o banco pelo papel sem privilégio (as travas por loja valem de verdade). O cookie do aparelho é simulado. */
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
    delete: (name: string) => { jar.delete(name); },
  }),
}));

const url = process.env.TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const role = "coliseu_comanda_test";

suite("comandas: pedidos pelo celular, conta no PDV, auditoria e isolamento entre lojistas", () => {
  let owner: pg.Client;
  const password = randomBytes(27).toString("base64url");
  let pool: typeof import("@/db").pool;
  let runWithScope: typeof import("@/db/scope").runWithScope;
  let svc: typeof import("@/modules/comandas/service");
  let pub: typeof import("@/modules/comandas/public");
  let tokens: typeof import("@/modules/comandas/token");
  let limits: typeof import("@/modules/comandas/rate-limit");
  let sales: typeof import("@/modules/sales/service");

  // lojista A (duas lojas) e lojista B (uma loja)
  let accountA: string; let storeA1: string; let storeA2: string; let accountB: string; let storeB1: string;
  let adminA: string; let adminB: string; let playerA: string;
  let beer: string; let card: string; let soldOut: string; let beerB: string;
  let comanda1: string; let comanda2: string; let comandaB1: string;
  const scopeA = () => ({ accountId: accountA, storeId: storeA1, storeIds: [storeA1] });
  const scopeB = () => ({ accountId: accountB, storeId: storeB1, storeIds: [storeB1] });
  const inA = <T>(run: () => Promise<T>) => runWithScope(scopeA(), run);
  const inB = <T>(run: () => Promise<T>) => runWithScope(scopeB(), run);
  const one = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await owner.query<T>(sql, params)).rows[0];
  const count = async (sql: string, params: unknown[] = []) => (await one<{ n: number }>(`SELECT count(*)::int n FROM (${sql}) q`, params)).n;

  const inside = { latitude: -23.55052, longitude: -46.633308, accuracyMeters: 12 };
  const farAway = { latitude: -23.5, longitude: -46.7, accuracyMeters: 12 };
  const ua = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
  let ipCounter = 10;
  let headers: Headers;
  const newCustomer = () => { jar.clear(); headers = new Headers({ "user-agent": ua, "x-forwarded-for": `203.0.113.${ipCounter++}` }); };
  const comandaOf = async (id: string, version = 1) => {
    const resolved = await pub.resolveComanda(tokens.signComandaToken(id, version));
    if (!resolved.ok) throw new Error(`link não resolveu: ${resolved.reason}`);
    return resolved.comanda;
  };
  const failure = async (promise: Promise<unknown>) => promise.then(() => null, (error: { code?: string; status?: number; message: string; name?: string }) => error);
  const events = (where = "TRUE", params: unknown[] = []) => owner.query<{ type: string; outcome: string; ip: string | null; user_agent: string | null; device_info: Record<string, unknown> | null; latitude: number | null; distance_meters: number | null; details: Record<string, unknown> | null }>(
    `SELECT type,outcome,ip,user_agent,device_info,latitude,distance_meters,details FROM comanda_events WHERE ${where} ORDER BY created_at,id`, params).then((result) => result.rows);
  const stockOf = async (product: string, store = storeA1) => (await one<{ quantity: number }>("SELECT quantity FROM product_stock WHERE product_id=$1 AND store_id=$2", [product, store])).quantity;
  const openFor = (comandaId: string, name = "Cliente da mesa") => inA(() => svc.openComandaSession({ comandaId, provisionalName: name }, adminA));
  const enter = async (comandaId = comanda1, location: unknown = inside) => pub.enterComanda(await comandaOf(comandaId), headers, { location, device: { screen: "390x844", language: "pt-BR" } });
  const order = async (items: { productId: string; quantity: number }[], location: unknown = inside, requestId = randomUUID(), comandaId = comanda1) =>
    pub.createCustomerOrder(await comandaOf(comandaId), headers, { requestId, items, location });

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    owner = new pg.Client({ connectionString: url });
    await owner.connect();
    execFileSync(process.execPath, [path.resolve("scripts/create-app-role.mjs")], { env: { ...process.env, DATABASE_URL: url!, APP_DB_ROLE: role, APP_DB_PASSWORD: password }, stdio: "pipe" });
    const target = new URL(url); target.username = role; target.password = password;
    process.env.DATABASE_URL = url;
    process.env.APP_DATABASE_URL = target.toString();
    process.env.COMANDA_LINK_SECRET = "segredo-de-teste-das-comandas-0123456789abcdef";
    ({ pool } = await import("@/db"));
    ({ runWithScope } = await import("@/db/scope"));
    svc = await import("@/modules/comandas/service");
    pub = await import("@/modules/comandas/public");
    tokens = await import("@/modules/comandas/token");
    limits = await import("@/modules/comandas/rate-limit");
    sales = await import("@/modules/sales/service");
  }, 120_000);
  afterAll(async () => {
    await pool?.end();
    await owner?.query(`DROP OWNED BY ${role}`).catch(() => undefined);
    await owner?.query(`DROP ROLE IF EXISTS ${role}`);
    await owner?.end();
  });

  beforeEach(async () => {
    await resetTenancy(owner);
    accountA = (await one<{ id: string }>("SELECT id FROM accounts")).id;
    storeA1 = (await one<{ id: string }>("SELECT id FROM stores")).id;
    storeA2 = (await one<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja A2') RETURNING id", [accountA])).id;
    accountB = (await one<{ id: string }>("INSERT INTO accounts (name) VALUES ('Lojista B') RETURNING id")).id;
    storeB1 = (await one<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja B1') RETURNING id", [accountB])).id;
    await owner.query("TRUNCATE rate_limits");
    await owner.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('PIX','PIX',1) ON CONFLICT DO NOTHING");
    adminA = (await one<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id,is_account_owner) VALUES ('Admin A','a@comanda.test','x','ADMIN',$1,true) RETURNING id", [accountA])).id;
    adminB = (await one<{ id: string }>("INSERT INTO users(name,email,password_hash,role,account_id,is_account_owner) VALUES ('Admin B','b@comanda.test','x','ADMIN',$1,true) RETURNING id", [accountB])).id;
    playerA = (await one<{ id: string }>("INSERT INTO players(name,account_id) VALUES ('Maria da Silva',$1) RETURNING id", [accountA])).id;
    const unit = (await one<{ id: string }>("INSERT INTO units(code,name) VALUES ('UN','Unidade') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id")).id;
    const categoryA = (await one<{ id: string }>("INSERT INTO categories(name,account_id) VALUES ('Bebidas',$1) RETURNING id", [accountA])).id;
    const categoryB = (await one<{ id: string }>("INSERT INTO categories(name,account_id) VALUES ('Bebidas',$1) RETURNING id", [accountB])).id;
    const product = async (sku: string, name: string, price: number, onMenu: boolean, stock: number, store: string, account: string, category: string) => {
      const id = (await one<{ id: string }>("INSERT INTO products(sku,name,category_id,unit_id,cost_cents,sale_price_cents,max_discount_bps,account_id,store_id,available_on_comanda) VALUES ($1,$2,$3,$4,300,$5,0,$6,$7,$8) RETURNING id", [sku, name, category, unit, price, account, store, onMenu])).id;
      await owner.query("INSERT INTO product_stock(product_id,store_id,quantity,cost_cents) VALUES ($1,$2,$3,300)", [id, store, stock]);
      return id;
    };
    beer = await product("CERV-1", "Cerveja long neck", 1000, true, 10, storeA1, accountA, categoryA);
    card = await product("CARTA-1", "Carta avulsa", 5000, false, 5, storeA1, accountA, categoryA);
    soldOut = await product("REFRI-0", "Refrigerante esgotado", 700, true, 0, storeA1, accountA, categoryA);
    beerB = await product("CERV-1", "Cerveja do lojista B", 1200, true, 10, storeB1, accountB, categoryB);
    await owner.query("INSERT INTO comanda_settings(store_id,enabled,require_location,latitude,longitude,radius_meters) VALUES ($1,true,true,-23.55052,-46.633308,150),($2,true,false,NULL,NULL,150)", [storeA1, storeB1]);
    await inA(() => svc.createComandas({ from: 1, to: 3 }, adminA));
    await inB(() => svc.createComandas({ from: 1, to: 2 }, adminB));
    comanda1 = (await one<{ id: string }>("SELECT id FROM comandas WHERE store_id=$1 AND number=1", [storeA1])).id;
    comanda2 = (await one<{ id: string }>("SELECT id FROM comandas WHERE store_id=$1 AND number=2", [storeA1])).id;
    comandaB1 = (await one<{ id: string }>("SELECT id FROM comandas WHERE store_id=$1 AND number=1", [storeB1])).id;
    newCustomer();
  });

  /* ------------------------------------------------------------------ cadastro e isolamento */

  it("cada loja numera as suas comandas: o mesmo número existe em lojas e lojistas diferentes, mas não repete na mesma loja", async () => {
    expect(await count("SELECT 1 FROM comandas WHERE number=1")).toBe(2);
    const dup = await failure(inA(() => svc.updateComanda(comanda2, { number: 1, active: true }, adminA)));
    expect(dup?.message).toMatch(/Já existe a comanda 1/);
    const again = await inA(() => svc.createComandas({ from: 1, to: 5 }, adminA));
    expect(again).toEqual({ created: 2, skipped: 3 });
    expect((await failure(inA(() => svc.createComandas({ from: 1, to: 400 }, adminA))))?.message).toMatch(/200 comandas/);
  });

  it("sob as travas, um lojista não enxerga comandas, pedidos nem auditoria do outro", async () => {
    await openFor(comanda1);
    const visibleToB = (await inB(() => pool.query("SELECT id FROM comandas"))).rows.map((row: { id: string }) => row.id);
    expect(visibleToB).toContain(comandaB1);
    expect(visibleToB).not.toContain(comanda1);
    expect((await inB(() => pool.query("SELECT 1 FROM comandas WHERE id=$1", [comanda1]))).rowCount).toBe(0);
    expect((await inB(() => pool.query("SELECT 1 FROM comanda_sessions"))).rowCount).toBe(0);
    // a auditoria do B tem só o que é do B (a criação das comandas dele), nada da abertura da comanda do A
    const eventsOfB = (await inB(() => pool.query("SELECT store_id,type FROM comanda_events"))).rows as { store_id: string; type: string }[];
    expect(eventsOfB.length).toBeGreaterThan(0);
    expect(eventsOfB.every((row) => row.store_id === storeB1 && row.type === "COMANDA_CREATED")).toBe(true);
    expect(((await inA(() => pool.query("SELECT type FROM comanda_events"))).rows as { type: string }[]).map((row) => row.type)).toContain("SESSION_OPENED");
    // sem escopo nenhum, as tabelas de loja não mostram nada (falha fechada)
    expect((await pool.query("SELECT 1 FROM comandas")).rowCount).toBe(0);
  });

  /* ------------------------------------------------------------------ abertura */

  it("abre a comanda para um jogador cadastrado ou cria um cadastro provisório, e não abre duas vezes", async () => {
    const withPlayer = await inA(() => svc.openComandaSession({ comandaId: comanda1, playerId: playerA }, adminA));
    expect(withPlayer.provisional).toBe(false);
    expect((await failure(inA(() => svc.openComandaSession({ comandaId: comanda1, provisionalName: "Outro" }, adminA))))?.code).toBe("ALREADY_OPEN");
    const provisional = await inA(() => svc.openComandaSession({ comandaId: comanda2, provisionalName: "Pedro Souza", provisionalPhone: "11999990000" }, adminA));
    expect(provisional.provisional).toBe(true);
    expect(await one("SELECT name,phone,provisional FROM players WHERE id=$1", [provisional.playerId])).toEqual({ name: "Pedro Souza", phone: "11999990000", provisional: true });
    expect((await failure(inA(() => svc.openComandaSession({ comandaId: comanda1 }, adminA))))?.message).toMatch(/Escolha um jogador/);
  });

  it("não deixa abrir a comanda com jogador de outro lojista", async () => {
    const stranger = (await one<{ id: string }>("INSERT INTO players(name,account_id) VALUES ('Estranho',$1) RETURNING id", [accountB])).id;
    expect(await failure(inA(() => svc.openComandaSession({ comandaId: comanda1, playerId: stranger }, adminA)))).not.toBeNull();
    expect(await count("SELECT 1 FROM comanda_sessions")).toBe(0);
  });

  /* ------------------------------------------------------------------ acesso do cliente */

  it("link adulterado ou de comanda inexistente não resolve, e quem insiste é barrado por tentativas", async () => {
    expect(await pub.resolveComanda("abc")).toEqual({ ok: false, reason: "INVALID" });
    const forged = tokens.signComandaToken(comanda1, 1).slice(0, -2) + "AA";
    expect(await pub.resolveComanda(forged)).toEqual({ ok: false, reason: "INVALID" });
    expect(await pub.resolveComanda(tokens.signComandaToken(randomUUID(), 1))).toEqual({ ok: false, reason: "INVALID" });
    const blocked = new Headers({ "user-agent": ua, "x-forwarded-for": "198.51.100.200" });
    let last: { status?: number } | null = null;
    for (let i = 0; i < 17; i++) last = await failure(pub.guard(blocked, "x".repeat(46)));
    expect(last?.status).toBe(429);
  });

  it("trocar o QR da comanda invalida o link antigo na hora", async () => {
    const old = tokens.signComandaToken(comanda1, 1);
    expect((await pub.resolveComanda(old)).ok).toBe(true);
    await inA(() => svc.rotateComandaQr(comanda1, adminA));
    expect(await pub.resolveComanda(old)).toEqual({ ok: false, reason: "INVALID" });
    expect((await pub.resolveComanda(tokens.signComandaToken(comanda1, 2))).ok).toBe(true);
  });

  it("o link de uma comanda dá acesso só à loja dela: com o escopo do link, os dados do outro lojista não existem", async () => {
    const mine = await comandaOf(comanda1);
    expect(mine.scope).toEqual({ accountId: accountA, storeId: storeA1, storeIds: [storeA1] });
    const seen = await runWithScope(mine.scope, async () => (await pool.query("SELECT id FROM products")).rows.map((row: { id: string }) => row.id));
    expect(seen).toContain(beer);
    expect(seen).not.toContain(beerB);
  });

  it("comanda fechada, pedidos desligados ou comanda desativada: o cliente é barrado e a tentativa fica na auditoria com IP e aparelho", async () => {
    expect((await failure(enter()))?.code).toBe("CLOSED");
    const [closed] = await events("type='LINK_BLOCKED'");
    expect(closed).toMatchObject({ outcome: "BLOCKED", ip: expect.stringMatching(/^203\.0\.113\./), details: { reason: "CLOSED" } });
    expect(closed.device_info).toMatchObject({ os: "Android", model: "SM-S918B", browser: "Chrome" });
    await openFor(comanda1);
    await owner.query("UPDATE comanda_settings SET enabled=false WHERE store_id=$1", [storeA1]);
    expect((await failure(enter()))?.code).toBe("DISABLED");
    await owner.query("UPDATE comanda_settings SET enabled=true WHERE store_id=$1", [storeA1]);
    await owner.query("UPDATE comandas SET active=false WHERE id=$1", [comanda1]);
    expect(await pub.resolveComanda(tokens.signComandaToken(comanda1, 1))).toEqual({ ok: false, reason: "UNAVAILABLE" });
  });

  it("localização: recusada, ausente ou fora do raio barra o cliente; dentro do raio libera, e tudo fica registrado", async () => {
    await openFor(comanda1);
    expect((await failure(enter(comanda1, { denied: true })))?.code).toBe("LOCATION_DENIED");
    expect((await failure(enter(comanda1, null)))?.code).toBe("LOCATION_MISSING");
    expect((await failure(enter(comanda1, farAway)))?.code).toBe("LOCATION_OUTSIDE");
    expect(await count("SELECT 1 FROM comanda_devices")).toBe(0);
    const outside = (await events("type='LINK_BLOCKED'")).find((event) => event.details?.reason === "LOCATION_OUTSIDE")!;
    expect(outside.distance_meters).toBeGreaterThan(1000);
    expect(outside.latitude).toBeCloseTo(farAway.latitude, 5);

    const entered = await enter();
    expect(entered).toMatchObject({ store: "Loja de teste", number: 1, playerFirstName: "Cliente" });
    expect(jar.size).toBe(1);
    expect(entered.menu.map((item) => item.name)).toEqual(["Cerveja long neck", "Refrigerante esgotado"]); // a carta avulsa não está no cardápio
    expect(entered.menu.find((item) => item.id === soldOut)?.maxQuantity).toBe(0);
    const [opened] = await events("type='LINK_OPENED'");
    expect(opened).toMatchObject({ outcome: "OK", ip: expect.stringMatching(/^203\.0\.113\./) });
    expect(opened.distance_meters).toBeLessThan(5);
    expect(opened.device_info).toMatchObject({ screen: "390x844", language: "pt-BR" });
  });

  it("o cliente só vê o primeiro nome do jogador", async () => {
    await inA(() => svc.openComandaSession({ comandaId: comanda1, playerId: playerA }, adminA));
    expect((await enter()).playerFirstName).toBe("Maria");
  });

  /* ------------------------------------------------------------------ pedidos */

  it("pedido do cliente entra direto na conta, com preço e nome vindos do servidor, e o balcão o vê como novo", async () => {
    await openFor(comanda1);
    await enter();
    const result = await pub.createCustomerOrder(await comandaOf(comanda1), headers, { requestId: randomUUID(), items: [{ productId: beer, quantity: 2, priceCents: 1 }], location: inside });
    expect(result.account.totalCents).toBe(2000);
    expect(result.account.orders[0]).toMatchObject({ status: "NEW", items: [{ name: "Cerveja long neck", quantity: 2, unitPriceCents: 1000, canceled: false }] });
    const created = (await events("type='ORDER_CREATED'"))[0];
    expect(created).toMatchObject({ outcome: "OK", ip: expect.stringMatching(/^203\.0\.113\./) });
    expect(created.details).toMatchObject({ lines: [{ productId: beer, quantity: 2, unitPriceCents: 1000 }] });
    const incoming = await inA(() => svc.listNewOrders());
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({ number: 1, items: [{ name: "Cerveja long neck", quantity: 2 }] });
  });

  it("pedido barrado: produto fora do cardápio, esgotado, de outro lojista, sem aparelho vinculado, ou de longe", async () => {
    await openFor(comanda1);
    await enter();
    expect((await failure(order([{ productId: card, quantity: 1 }])))?.code).toBe("PRODUCT_UNAVAILABLE");
    expect((await failure(order([{ productId: soldOut, quantity: 1 }])))?.code).toBe("INSUFFICIENT_STOCK");
    expect((await failure(order([{ productId: beerB, quantity: 1 }])))?.code).toBe("PRODUCT_UNAVAILABLE");
    expect((await failure(order([{ productId: beer, quantity: 1 }], farAway)))?.code).toBe("LOCATION_OUTSIDE");
    expect((await failure(order([{ productId: beer, quantity: 1 }], { denied: true })))?.code).toBe("LOCATION_DENIED");
    expect((await failure(order([{ productId: beer, quantity: 11 }])))?.name).toBe("ZodError");
    expect((await failure(order([{ productId: "nao-e-uuid", quantity: 1 }])))?.name).toBe("ZodError");
    expect(await count("SELECT 1 FROM comanda_orders")).toBe(0);
    const reasons = (await events("type='ORDER_BLOCKED'")).map((event) => event.details?.reason);
    expect(reasons).toEqual(expect.arrayContaining(["PRODUCT_UNAVAILABLE", "INSUFFICIENT_STOCK", "LOCATION_OUTSIDE", "LOCATION_DENIED"]));
    newCustomer(); // outro aparelho que não passou pelo "entrar"
    expect((await failure(order([{ productId: beer, quantity: 1 }])))?.code).toBe("NO_DEVICE");
  });

  it("o mesmo envio repetido (toque duplo, rede ruim) não gera dois pedidos", async () => {
    await openFor(comanda1);
    await enter();
    const requestId = randomUUID();
    await order([{ productId: beer, quantity: 1 }], inside, requestId);
    const second = await order([{ productId: beer, quantity: 1 }], inside, requestId);
    expect(await count("SELECT 1 FROM comanda_orders")).toBe(1);
    expect(second.account.totalCents).toBe(1000);
  });

  it("o estoque é reservado pelas comandas abertas: dois pedidos não passam do saldo, e cancelar libera", async () => {
    await openFor(comanda1);
    await enter();
    await order([{ productId: beer, quantity: 6 }]);
    const refused = await failure(order([{ productId: beer, quantity: 6 }]));
    expect(refused).toMatchObject({ code: "INSUFFICIENT_STOCK", message: expect.stringMatching(/só restam 4/) });
    expect(await stockOf(beer)).toBe(10); // a conta só baixa o estoque ao ser cobrada
    const orderId = (await one<{ id: string }>("SELECT id FROM comanda_orders")).id;
    await inA(() => svc.cancelOrder(orderId, "pedido duplicado", adminA));
    await order([{ productId: beer, quantity: 6 }]);
    expect(await count("SELECT 1 FROM comanda_orders WHERE status<>'CANCELED'")).toBe(1);
  });

  it("pedidos simultâneos do último item: só um passa", async () => {
    await owner.query("UPDATE product_stock SET quantity=1 WHERE product_id=$1", [beer]);
    await openFor(comanda1);
    await openFor(comanda2, "Segundo cliente");
    const firstHeaders = new Headers({ "user-agent": ua, "x-forwarded-for": "203.0.113.150" });
    await pub.enterComanda(await comandaOf(comanda1), firstHeaders, { location: inside });
    const secondHeaders = new Headers({ "user-agent": ua, "x-forwarded-for": "203.0.113.151" });
    await pub.enterComanda(await comandaOf(comanda2), secondHeaders, { location: inside });
    const results = await Promise.allSettled([comanda1, comanda2].map(async (id, index) => pub.createCustomerOrder(await comandaOf(id), index ? secondHeaders : firstHeaders, { requestId: randomUUID(), items: [{ productId: beer, quantity: 1 }], location: inside })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await count("SELECT 1 FROM comanda_orders")).toBe(1);
  });

  it("depois que a comanda é fechada, o celular não consegue mais pedir nem ler a conta", async () => {
    await openFor(comanda1);
    await enter();
    const sessionId = (await one<{ id: string }>("SELECT id FROM comanda_sessions")).id;
    await inA(() => svc.cancelComandaSession(sessionId, "cliente foi embora", adminA));
    expect((await failure(order([{ productId: beer, quantity: 1 }])))?.code).toBe("CLOSED");
    expect(await pub.readCustomerAccount(await comandaOf(comanda1))).toEqual({ state: "CLOSED" });
  });

  it("o limite de pedidos por comanda barra a enxurrada", async () => {
    await openFor(comanda1);
    await enter();
    let last: { code?: string } | null = null;
    for (let i = 0; i < 22 && last?.code !== "RATE_LIMITED"; i++) last = await failure(order([{ productId: beer, quantity: 1 }]));
    expect(last?.code).toBe("RATE_LIMITED");
    expect(await count("SELECT 1 FROM comanda_orders")).toBeLessThanOrEqual(20);
  });

  it("limite de tentativas: conta por janela e zera quando ela passa", async () => {
    const key = limits.hashKey("teste", "alguem");
    expect(key).not.toContain("alguem");
    for (let i = 0; i < 3; i++) expect((await limits.hit(key, 3, 60)).allowed).toBe(true);
    expect((await limits.hit(key, 3, 60)).allowed).toBe(false);
    await owner.query("UPDATE rate_limits SET window_start=now()-interval '2 minutes' WHERE key=$1", [key]);
    expect((await limits.hit(key, 3, 60)).allowed).toBe(true);
  });

  /* ------------------------------------------------------------------ balcão */

  it("o balcão lança, entrega e cancela itens; cancelar o último item cancela o pedido; a comanda só é cancelada sem itens", async () => {
    const { sessionId } = await openFor(comanda1);
    await enter();
    await order([{ productId: beer, quantity: 2 }]);
    await inA(() => svc.addCounterOrder(sessionId, [{ productId: card, quantity: 1 }], adminA, "da vitrine")); // o balcão vende qualquer produto
    let detail = (await inA(() => svc.getSessionDetail(sessionId)))!;
    expect(detail.totalCents).toBe(2000 + 5000);
    expect(detail.newOrders).toBe(1);
    expect(detail.orders.find((entry) => entry.source === "COUNTER")?.status).toBe("DELIVERED");
    const customerOrder = detail.orders.find((entry) => entry.source === "CUSTOMER")!;
    await inA(() => svc.markOrderDelivered(customerOrder.id, adminA));
    expect(await inA(() => svc.listNewOrders())).toHaveLength(0);
    expect((await failure(inA(() => svc.cancelComandaSession(sessionId, "engano", adminA))))?.code).toBe("HAS_ITEMS");
    expect((await failure(inA(() => svc.cancelOrderItem(customerOrder.items[0].id, "x", adminA))))?.message).toMatch(/motivo/);
    await inA(() => svc.cancelOrderItem(customerOrder.items[0].id, "cliente desistiu", adminA));
    detail = (await inA(() => svc.getSessionDetail(sessionId)))!;
    expect(detail.orders.find((entry) => entry.id === customerOrder.id)?.status).toBe("CANCELED");
    expect(detail.totalCents).toBe(5000);
    const counterOrder = detail.orders.find((entry) => entry.source === "COUNTER")!;
    await inA(() => svc.cancelOrder(counterOrder.id, "lançado errado", adminA));
    await inA(() => svc.cancelComandaSession(sessionId, "cliente foi embora", adminA));
    expect(await one("SELECT status FROM comanda_sessions WHERE id=$1", [sessionId])).toEqual({ status: "CANCELED" });
    const types = (await events("session_id=$1", [sessionId])).map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["SESSION_OPENED", "LINK_OPENED", "ORDER_CREATED", "COUNTER_ORDER_CREATED", "ORDER_DELIVERED", "ITEM_CANCELED", "ORDER_CANCELED", "SESSION_CANCELED"]));
  });

  /* ------------------------------------------------------------------ cobrança no PDV */

  it("cobrar a conta no PDV vira uma venda, baixa o estoque, encerra a comanda e libera a reserva", async () => {
    const { sessionId } = await openFor(comanda1, "Cliente provisório");
    await enter();
    await order([{ productId: beer, quantity: 2 }]);
    await inA(() => svc.addCounterOrder(sessionId, [{ productId: card, quantity: 1 }], adminA));
    const cart = (await inA(() => svc.loadSessionCart(sessionId)))!;
    expect(cart.player.provisional).toBe(true);
    expect(cart.items.map((item) => [item.name, item.quantity])).toEqual([["Carta avulsa", 1], ["Cerveja long neck", 2]]);

    const payment = [{ methodCode: "PIX", amountAppliedCents: 7000 }];
    const wrong = await failure(inA(() => sales.createSale({ items: [{ productId: beer, quantity: 1, discountBasisPoints: 0 }, { productId: card, quantity: 1, discountBasisPoints: 0 }], payments: [{ methodCode: "PIX", amountAppliedCents: 6000 }], comandaSessionId: sessionId }, adminA)));
    expect(wrong?.code).toBe("COMANDA_CHANGED");
    expect(await count("SELECT 1 FROM sales")).toBe(0);

    const sale = await inA(() => sales.createSale({ items: cart.items.map((item) => ({ productId: item.id, quantity: item.quantity, discountBasisPoints: 0 })), payments: payment, comandaSessionId: sessionId }, adminA));
    expect(sale.totalCents).toBe(7000);
    expect(await one("SELECT status,sale_id,closed_by_id=$2 AS by_me FROM comanda_sessions WHERE id=$1", [sessionId, adminA])).toEqual({ status: "CLOSED", sale_id: sale.id, by_me: true });
    expect(await one("SELECT comanda_session_id FROM sales WHERE id=$1", [sale.id])).toEqual({ comanda_session_id: sessionId });
    expect(await stockOf(beer)).toBe(8);
    expect(await stockOf(card)).toBe(4);
    expect((await events("type='SESSION_CLOSED'"))[0].details).toMatchObject({ saleId: sale.id, totalCents: 7000 });
    expect((await failure(inA(() => sales.createSale({ items: cart.items.map((item) => ({ productId: item.id, quantity: item.quantity, discountBasisPoints: 0 })), payments: payment, comandaSessionId: sessionId }, adminA))))?.code).toBe("SESSION_CLOSED");
    expect((await failure(order([{ productId: beer, quantity: 1 }])))?.code).toBe("CLOSED");
    // a comanda volta a ficar livre para o próximo cliente
    expect((await inA(() => svc.openComandaSession({ comandaId: comanda1, provisionalName: "Próximo cliente" }, adminA))).sessionId).not.toBe(sessionId);
  });

  it("depois da cobrança, o cadastro provisório pode ser completado uma única vez", async () => {
    const { sessionId, playerId } = await openFor(comanda1, "Cliente provisório");
    await inA(() => svc.addCounterOrder(sessionId, [{ productId: beer, quantity: 1 }], adminA));
    await inA(() => sales.createSale({ items: [{ productId: beer, quantity: 1, discountBasisPoints: 0 }], payments: [{ methodCode: "PIX", amountAppliedCents: 1000 }], comandaSessionId: sessionId }, adminA));
    await inA(() => svc.completeProvisionalPlayer(playerId, { name: "Cliente Completo da Silva", phone: "11988887777", email: "cliente@exemplo.com" }, adminA, sessionId));
    expect(await one("SELECT name,phone,email,provisional FROM players WHERE id=$1", [playerId])).toEqual({ name: "Cliente Completo da Silva", phone: "11988887777", email: "cliente@exemplo.com", provisional: false });
    expect((await failure(inA(() => svc.completeProvisionalPlayer(playerId, { name: "Outro nome" }, adminA))))?.code).toBe("NOT_PROVISIONAL");
    expect((await failure(inA(() => svc.completeProvisionalPlayer(playerId, { name: "X" }, adminA))))?.message).toMatch(/nome/i);
  });

  /* ------------------------------------------------------------------ cardápio, consistência e retenção */

  it("o cardápio escolhe só produtos visíveis da loja e começa desligado", async () => {
    expect((await owner.query("SELECT 1 FROM products WHERE available_on_comanda AND id=$1", [card])).rowCount).toBe(0);
    const result = await inA(() => svc.saveComandaMenu([card, beer], adminA));
    expect(result.onMenu).toBe(2);
    expect(await count("SELECT 1 FROM products WHERE available_on_comanda AND account_id=$1", [accountA])).toBe(2);
    expect((await owner.query("SELECT available_on_comanda FROM products WHERE id=$1", [beerB])).rows[0].available_on_comanda).toBe(true); // do outro lojista: intocado
  });

  it("o banco recusa ligar a comanda a dados de outra loja", async () => {
    const { sessionId } = await openFor(comanda1);
    const orderId = (await one<{ id: string }>("INSERT INTO comanda_orders(store_id,session_id,source,status) VALUES ($1,$2,'COUNTER','DELIVERED') RETURNING id", [storeA1, sessionId])).id;
    await expect(owner.query("INSERT INTO comanda_order_items(store_id,order_id,product_id,product_name,unit_price_cents,quantity) VALUES ($1,$2,$3,'x',1,1)", [storeA1, orderId, beerB])).rejects.toThrow(/de outra loja/);
    await expect(owner.query("INSERT INTO comanda_orders(store_id,session_id,source,status) VALUES ($1,$2,'COUNTER','NEW')", [storeA2, sessionId])).rejects.toThrow(/de outra loja/);
    await expect(owner.query("INSERT INTO comanda_sessions(store_id,comanda_id,player_id,opened_by_id) VALUES ($1,$2,$3,$4)", [storeA2, comanda2, playerA, adminA])).rejects.toThrow(/de outra loja/);
    const strangerPlayer = (await one<{ id: string }>("INSERT INTO players(name,account_id) VALUES ('Outro lojista',$1) RETURNING id", [accountB])).id;
    await expect(owner.query("INSERT INTO comanda_sessions(store_id,comanda_id,player_id,opened_by_id) VALUES ($1,$2,$3,$4)", [storeA1, comanda2, strangerPlayer, adminA])).rejects.toThrow(/outro lojista/);
  });

  it("a função de consulta do link é a única coisa que enxerga sem escopo, e devolve só o necessário", async () => {
    const row = (await pool.query("SELECT * FROM comanda_public_lookup($1)", [comanda1])).rows[0];
    expect(Object.keys(row).sort()).toEqual(["account_active", "account_id", "active", "comanda_id", "number", "store_active", "store_id", "store_name", "token_version"]);
    expect(row).toMatchObject({ comanda_id: comanda1, store_id: storeA1, account_id: accountA, number: 1, token_version: 1, active: true });
    expect((await pool.query("SELECT * FROM comanda_public_lookup($1)", [randomUUID()])).rowCount).toBe(0);
  });

  it("passados 90 dias, a auditoria perde o final do IP e a posição exata, e mantém aparelho, horário e resultado", async () => {
    await openFor(comanda1);
    await enter();
    await order([{ productId: beer, quantity: 1 }]);
    const old = (await one<{ id: string }>("INSERT INTO comanda_events(store_id,comanda_id,type,ip,user_agent,device_info,latitude,longitude,accuracy_meters,distance_meters,created_at) VALUES ($1,$2,'LINK_OPENED','203.0.113.77',$3,'{\"os\":\"Android\"}',-23.5,-46.6,12,30,now()-interval '91 days') RETURNING id", [storeA1, comanda1, ua])).id;
    const oldV6 = (await one<{ id: string }>("INSERT INTO comanda_events(store_id,comanda_id,type,ip,latitude,longitude,created_at) VALUES ($1,$2,'LINK_OPENED','2804:14d:5c80:1234:abcd::1',-23.5,-46.6,now()-interval '120 days') RETURNING id", [storeA1, comanda1])).id;
    await owner.query("INSERT INTO comanda_devices(store_id,session_id,secret_hash,ip,last_seen_at) SELECT $1,id,'hash-antigo','198.51.100.9',now()-interval '100 days' FROM comanda_sessions LIMIT 1", [storeA1]);
    const changed = (await one<{ n: number }>("SELECT comanda_anonymize_old(90) AS n")).n;
    expect(changed).toBeGreaterThanOrEqual(3);
    expect(await one("SELECT ip,latitude,longitude,accuracy_meters,distance_meters,user_agent IS NOT NULL AS ua,device_info->>'os' AS os,anonymized_at IS NOT NULL AS done FROM comanda_events WHERE id=$1", [old])).toEqual({ ip: "203.0.113.0", latitude: null, longitude: null, accuracy_meters: null, distance_meters: 30, ua: true, os: "Android", done: true });
    expect(await one("SELECT ip,latitude FROM comanda_events WHERE id=$1", [oldV6])).toEqual({ ip: "2804:14d:5c80::", latitude: null });
    expect(await one("SELECT ip FROM comanda_devices WHERE secret_hash='hash-antigo'")).toEqual({ ip: "198.51.100.0" });
    // o que é recente continua completo
    const recent = (await events("type='ORDER_CREATED'"))[0];
    expect(recent.ip).toMatch(/^203\.0\.113\.\d+$/);
    expect(recent.latitude).not.toBeNull();
    expect((await one<{ n: number }>("SELECT comanda_anonymize_old(90) AS n")).n).toBe(0);
  });

  it("a auditoria lista os eventos com filtros e conta o total", async () => {
    const { sessionId } = await openFor(comanda1);
    await enter();
    await order([{ productId: beer, quantity: 1 }]);
    await failure(order([{ productId: beer, quantity: 1 }], farAway));
    const all = await inA(() => svc.listComandaEvents({}, 1, 50));
    expect(all[0].total_count).toBe(all.length);
    expect(all.map((event) => event.type)).toEqual(expect.arrayContaining(["SESSION_OPENED", "LINK_OPENED", "ORDER_CREATED", "ORDER_BLOCKED"]));
    const blocked = await inA(() => svc.listComandaEvents({ outcome: "BLOCKED", sessionId }, 1, 50));
    expect(blocked.every((event) => event.outcome === "BLOCKED")).toBe(true);
    expect(blocked.length).toBeGreaterThan(0);
    const ofB = await inB(() => svc.listComandaEvents({}, 1, 50));
    expect(ofB.every((event) => event.type === "COMANDA_CREATED")).toBe(true);
  });

  /* ------------------------------------------------------------------ rotas públicas */

  it("as rotas públicas respondem sem expor detalhes: dado inválido é 422, link inválido é 404 genérico, sem aparelho é 401, e nada fica em cache", async () => {
    await openFor(comanda1);
    await enter();
    const token = tokens.signComandaToken(comanda1, 1);
    const post = (body: unknown, origin?: string) => new Request(`http://localhost/api/pedidos/${token}/pedido`, { method: "POST", headers: { ...Object.fromEntries(headers), ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
    const submit = (request: Request, usedToken = token) => pub.handlePublic(request, usedToken, async (comanda, requestHeaders) => pub.createCustomerOrder(comanda, requestHeaders, await pub.readJsonBody(request)));

    const invalid = await submit(post({ requestId: randomUUID(), items: [{ productId: beer, quantity: 11 }], location: inside }));
    expect(invalid.status).toBe(422);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
    expect((await submit(post({}, "https://site-de-terceiros.example"))).status).toBe(403); // origem diferente
    const bad = await submit(post({}), "x".repeat(46));
    expect(bad.status).toBe(404);
    expect((await bad.json()).code).toBe("INVALID_LINK");
    const oversized = await submit(post({ note: "x".repeat(9000) }));
    expect(oversized.status).toBe(413);

    jar.clear(); // aparelho sem sessão consultando a conta
    const account = await pub.handlePublic(new Request(`http://localhost/api/pedidos/${token}/conta`, { headers }), token, async (comanda) => pub.readCustomerAccount(comanda));
    expect(account.status).toBe(401);
    expect(((await account.json()) as { code: string }).code).toBe("NO_DEVICE");
  });
});
