import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import { encryptTotpSecret, generateTotpCode, generateTotpSecret } from "../src/modules/auth/totp";
import { signComandaToken } from "../src/modules/comandas/token";
import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@coliseu.local";
const operatorEmail = process.env.SEED_OPERATOR_EMAIL ?? "operador@coliseu.local";
const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? "TroqueEstaSenha123!";
const operatorPassword = process.env.SEED_OPERATOR_PASSWORD ?? "TroqueEstaSenha123!";
const playerName = `Jogador E2E ${Date.now()}`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

/* Troca a loja pelo seletor do menu. Numa página pesada o clique pode chegar antes de a hidratação terminar e o evento se perde:
 * repete até o rodapé mostrar a loja escolhida. */
async function chooseStore(page: Page, label: string) {
  const select = page.getByLabel("Loja ativa");
  await expect(async () => {
    await select.selectOption({ label });
    await expect(page.locator(".admin-footer")).toContainText(label, { timeout: 3000 });
  }).toPass({ timeout: 25_000 });
}

/* Entra e segue para o painel. Quem ainda não configurou a loja vê as boas-vindas do acesso guiado na primeira visita: elas cobrem a
 * tela, então são dispensadas aqui para o teste seguir (o fluxo do guia tem teste próprio). */
async function login(page: Page, email: string, password: string) {
  await signIn(page, email, password);
  if (new URL(page.url()).pathname !== "/admin") return;
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  // o guia confere o andamento antes de decidir se dá as boas-vindas ("checking"); sem guia montado, o atributo nem existe
  await page.locator("html[data-guide]:not([data-guide=checking])").waitFor({ state: "attached", timeout: 4000 }).catch(() => undefined);
  const later = page.getByRole("button", { name: "Agora não" });
  if (await later.isVisible()) {
    await expect(async () => { if (await later.isVisible()) await later.click(); await expect(later).toBeHidden({ timeout: 2000 }); }).toPass();
    // "Agora não" grava um cookie por uma ação do servidor: navegar antes disso faria as boas-vindas voltarem na página seguinte
    await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.startsWith("coliseu_guide_"))).toBe(true);
  }
}

test.describe.serial("fluxos essenciais", () => {
  test("landing publica a prévia social do WhatsApp", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Coliseon PDV/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /PDV, estoque, financeiro/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
    const imageUrl = await page.locator('meta[property="og:image"]').getAttribute("content");
    const parsedImageUrl = new URL(imageUrl!);
    const imageResponse = await request.get(`${parsedImageUrl.pathname}${parsedImageUrl.search}`);
    expect(imageResponse.ok()).toBeTruthy();
    expect(imageResponse.headers()["content-type"]).toContain("image/png");
  });

  test("publica manifest, ícones e página offline do PWA", async ({ page, request }) => {
    await page.goto("/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#172744");
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /favicon|icon/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "Coliseon PDV & Gestão", display: "standalone", start_url: "/login", lang: "pt-BR" });
    expect(manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes}:${icon.purpose}`)).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of manifest.icons as { src: string }[]) expect((await request.get(icon.src)).ok()).toBeTruthy();
    const worker = await request.get("/sw.js");
    expect(worker.ok()).toBeTruthy();
    expect(worker.headers()["cache-control"]).toContain("no-store");
    expect((await request.get("/offline.html")).ok()).toBeTruthy();
  });

  test("login oferece sessão persistente sem armazenar a senha", async ({ page, context }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
    await page.getByLabel("E-mail corporativo").fill(adminEmail);
    await page.getByLabel("Senha", { exact: true }).fill(seedPassword);
    await page.getByLabel("Manter conectado neste dispositivo").check();
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    await page.waitForURL((url) => url.pathname !== "/login");
    const session = (await context.cookies()).find((cookie) => cookie.name === "coliseu_session");
    expect(session?.httpOnly).toBeTruthy();
    expect(session?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 28 * 86_400);
  });

  test("administrador entra e visualiza o dashboard", async ({ page }) => {
    await login(page, adminEmail, seedPassword);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Legado", exact: true })).toHaveCount(0);
    await expect(page.getByText("Faturamento — últimos 14 dias")).toBeVisible();
    await expect(page.getByText("Fluxo financeiro realizado — últimos 14 dias")).toBeVisible();
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    await expect(page.locator(".admin-footer")).toContainText(`Versão ${version}`);
    await expect(page.locator(".admin-footer")).toContainText("Coliseu TCG");
    await page.getByRole("button", { name: "Recolher menu" }).click();
    await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();
    await page.getByRole("button", { name: "Expandir menu" }).click();
    await page.getByRole("button", { name: "Operação" }).click();
    await expect(page.getByRole("link", { name: "Vendas" })).toBeHidden();
    await page.getByRole("button", { name: "Operação" }).click();
    await expect(page.getByRole("link", { name: "Vendas" })).toBeVisible();
  });

  test("administrador acessa as novas áreas operacionais", async ({ page }) => {
    await login(page, adminEmail, seedPassword);
    for (const [path, heading] of [
      ["/admin/cash", "Caixas"],
      ["/admin/printers", "Impressoras"],
      ["/admin/inventory", "Inventários"],
      ["/admin/purchases", "Pedidos de compra"],
      ["/admin/labels", "Etiquetas"],
      ["/admin/audit", "Auditoria"],
      ["/security", "Autenticação em duas etapas"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  test("administrador cadastra jogador para uso de crédito", async ({ page }) => {
    await login(page, adminEmail, seedPassword);
    await page.goto("/admin/players");
    await page.getByRole("button", { name: "Novo jogador" }).click();
    const createForm = page.getByRole("dialog");
    await createForm.getByLabel("Nome").fill(playerName);
    await createForm.getByLabel("E-mail").fill(`jogador-e2e-${Date.now()}@coliseu.local`);
    await createForm.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator("td b", { hasText: playerName })).toBeVisible();
  });

  test("usuário novo nasce vinculado à loja e o lojista titular não pode ser rebaixado", async ({ page }) => {
    const email = `usuario-e2e-${Date.now()}@coliseu.local`;
    await login(page, adminEmail, seedPassword);
    await page.goto("/admin/users");
    const owner = page.locator("tr", { hasText: adminEmail });
    await expect(owner.getByText("Lojista", { exact: true })).toBeVisible();
    await expect(owner.getByText("Todas as lojas")).toBeVisible();

    await page.getByRole("button", { name: "Novo usuário" }).click();
    const createForm = page.getByRole("dialog");
    await createForm.getByLabel("Nome").fill("Usuário E2E");
    await createForm.getByLabel("E-mail").fill(email);
    await createForm.getByLabel("Senha").fill("SenhaE2E-12345");
    await createForm.getByRole("button", { name: "Criar usuário" }).click();
    await expect(page.locator("tr", { hasText: email }).getByText("Coliseu TCG")).toBeVisible();

    await owner.getByRole("button", { name: "Editar" }).click();
    const editForm = page.getByRole("dialog");
    await editForm.getByLabel("Perfil").selectOption("OPERATOR");
    await editForm.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("O lojista titular da conta não pode ser desativado nem rebaixado.")).toBeVisible();
  });

  test("administrador acessa o painel de notas fiscais", async ({ page }) => {
    await login(page, adminEmail, seedPassword);
    await page.goto("/admin/fiscal");
    await expect(page.getByRole("heading", { name: "Notas fiscais", exact: true })).toBeVisible();
    await expect(page.getByLabel("Empresa emitente")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sincronizar agora" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Importar XMLs" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Documentos" })).toBeVisible();
    await page.getByRole("link", { name: "Entradas e saídas" }).first().click();
    await expect(page.getByRole("heading", { name: "Notas de entrada e saída" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Notas de entrada" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Notas de saída" })).toBeVisible();
    await page.goto("/admin/fiscal");
    await page.getByRole("link", { name: "Importação e SEFAZ" }).first().click();
    await expect(page.getByRole("heading", { name: "Importação e SEFAZ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sincronizar agora" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Importar XMLs" })).toBeVisible();
  });

  test("financeiro mantém contas automáticas e informa a baixa manual", async ({ page }) => {
    await login(page, adminEmail, seedPassword);
    await page.goto("/admin/finance");
    await expect(page.getByRole("heading", { name: "Contas a pagar e receber" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Duplicatas por fornecedor" })).toBeVisible();
    await expect(page.getByLabel("Fornecedor")).toBeVisible();
    await expect(page.getByRole("group", { name: "Vencimento" })).toBeVisible();
    await page.getByText("Datas e valores").click();
    await expect(page.getByLabel("Saldo mínimo (R$)")).toBeVisible();
    await expect(page.getByText("Contas e liquidações geradas automaticamente pelas operações do sistema.")).toBeVisible();
    await expect(page.getByText("Como a SEFAZ não informa pagamentos, a baixa das duplicatas é registrada manualmente.")).toBeVisible();
  });

  test("administrador encontra somente produtos habilitados para abrir", async ({ page }) => {
    await login(page, adminEmail, seedPassword);
    await page.goto("/admin/stock");
    await page.getByRole("button", { name: "Abrir produto em boosters" }).click();
    await expect(page.getByRole("heading", { name: "Abrir produto em boosters" })).toBeVisible();
    const source = page.getByLabel("Produto para abrir");
    await expect(source.locator("option", { hasText: "Magic Foundations — Play Booster Box" })).toHaveCount(1);
    await expect(source.locator("option", { hasText: "Pokémon TCG — Triple Pack Blister" })).toHaveCount(1);
    await expect(source.locator("option", { hasText: "Pokémon Surging Sparks — Elite Trainer Box" })).toHaveCount(1);
    await expect(source.locator("option", { hasText: "Magic Foundations — Play Booster ·" })).toHaveCount(0);
    await expect(page.getByLabel("Quantidade de boxes/unidades a abrir")).toBeVisible();
    await expect(page.getByLabel("Boosters por box/unidade")).toBeVisible();
    await expect(page.getByLabel("Venda unitária (R$)")).toBeVisible();
    await expect(page.getByLabel("Nome do booster avulso")).toBeVisible();
  });

  test("operador realiza a venda de Coca-Cola com PIX", async ({ page }) => {
    await login(page, operatorEmail, operatorPassword);
    const searchResponse = page.waitForResponse((response) => response.url().includes("/api/pos/products?q="));
    await page.getByPlaceholder("Nome, SKU ou código de barras").fill("Coca-Cola");
    await expect((await searchResponse).ok()).toBeTruthy();
    await page.getByText("Refrigerante Coca-Cola 2L").first().click();
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await page.getByLabel("PIX").fill("9,00");
    const saleResponse = page.waitForResponse((response) => response.url().endsWith("/api/sales"));
    await page.getByRole("button", { name: "Confirmar venda" }).click();
    await expect((await saleResponse).status()).toBe(201);
    await expect(page.getByText("Venda concluída")).toBeVisible();
  });

  test("operador combina o PDV com crédito do jogador", async ({ page }) => {
    await login(page, operatorEmail, operatorPassword);
    const productResponse = page.waitForResponse((response) => response.url().includes("/api/pos/products?q="));
    await page.getByPlaceholder("Nome, SKU ou código de barras").fill("Água mineral");
    await expect((await productResponse).ok()).toBeTruthy();
    await page.getByText("Água mineral 500ml").first().click();
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await page.getByLabel("PIX").fill("");
    await page.getByLabel("Crédito do jogador").fill("3,00");
    const playerResponse = page.waitForResponse((response) => response.url().includes("/api/pos/players?q="));
    await page.getByPlaceholder("Nome, e-mail ou telefone").fill(playerName);
    await expect((await playerResponse).ok()).toBeTruthy();
    await page.getByRole("button", { name: new RegExp(playerName) }).first().click();
    await expect(page.getByText("Saldo disponível (pode ficar negativo)")).toBeVisible();
    const saleResponse = page.waitForResponse((response) => response.url().endsWith("/api/sales"));
    await page.getByRole("button", { name: "Confirmar venda" }).click();
    await expect((await saleResponse).status()).toBe(201);
    await expect(page.getByText("Venda concluída")).toBeVisible();
  });
  test("lojista com mais de uma loja escolhe a loja ativa e o sistema grava nela", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "precisa acessar o banco para criar a segunda loja");
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const account = (await db.query<{ id: string }>("SELECT id FROM accounts LIMIT 1")).rows[0].id;
    const second = (await db.query<{ id: string }>("INSERT INTO stores (account_id,name) VALUES ($1,'Loja E2E') RETURNING id", [account])).rows[0].id;
    const registerName = `Caixa E2E ${Date.now()}`;
    try {
      await login(page, adminEmail, seedPassword);
      await page.goto("/admin");
      await expect(page.locator(".admin-footer")).toContainText("Todas as lojas (2)");
      const switcher = page.getByLabel("Loja ativa");
      await expect(switcher).toBeVisible();
      await expect(page.getByRole("heading", { name: "Por loja" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "Loja E2E" })).toBeVisible();

      // na visão de todas as lojas só se lê: gravar pede para escolher a loja
      await page.goto("/admin/cash");
      await page.getByRole("button", { name: "Novo caixa" }).click();
      await page.getByRole("dialog").getByLabel("Nome").fill(registerName);
      await page.getByRole("dialog").getByRole("button", { name: "Cadastrar caixa" }).click();
      await expect(page.getByText("Escolha uma loja específica")).toBeVisible();
      await page.keyboard.press("Escape");

      // escolhendo a loja, o caixa é gravado nela
      await switcher.selectOption({ label: "Loja E2E" });
      await expect(page.locator(".admin-footer")).toContainText("Loja E2E");
      // o seletor mostra a loja escolhida (antes voltava para a anterior até recarregar a página)
      await expect(switcher).toHaveValue(second);
      await page.getByRole("button", { name: "Novo caixa" }).click();
      await page.getByRole("dialog").getByLabel("Nome").fill(registerName);
      await page.getByRole("dialog").getByRole("button", { name: "Cadastrar caixa" }).click();
      await expect.poll(async () => (await db.query<{ store_id: string }>("SELECT store_id FROM cash_registers WHERE name=$1", [registerName])).rows[0]?.store_id).toBe(second);

      // cada loja tem os seus produtos: a loja nova começa sem nenhum (o banco só devolve os dela), e o aviso diz de qual loja é a lista
      const enforced = Boolean(process.env.APP_DATABASE_URL);
      await page.goto("/admin/products");
      await expect(page.locator(".stock-scope")).toContainText("Produtos e saldo da loja Loja E2E");
      await expect(page.getByRole("link", { name: "Novo produto" }).first()).toBeVisible();
      if (enforced) {
        await expect(page.getByText("Nenhum produto encontrado")).toBeVisible();
        await page.goto("/admin/stock");
        await expect(page.getByText("Nenhum produto encontrado")).toBeVisible();
      }

      // o PDV não funciona na visão de todas as lojas
      await switcher.selectOption({ label: "Todas as lojas" });
      await expect(switcher).toHaveValue("all");
      await expect(page.locator(".admin-footer")).toContainText("Todas as lojas (2)");
      // na visão de todas as lojas cada produto mostra a loja dele, e o que exige uma loja fica desabilitado
      const firstStore = (await db.query<{ name: string }>("SELECT name FROM stores WHERE account_id=$1 AND id<>$2 ORDER BY created_at LIMIT 1", [account, second])).rows[0].name;
      await page.goto("/admin/products");
      await expect(page.locator(".stock-scope")).toContainText("Produtos e saldos das 2 lojas");
      await expect(page.locator(".stock-breakdown").first()).toHaveText(firstStore);
      await expect(page.getByRole("button", { name: "Novo produto" })).toBeDisabled();
      await page.goto("/admin/stock");
      await expect(page.getByRole("button", { name: "Ajustar estoque" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Abrir produto em boosters" })).toBeDisabled();
      await page.goto("/pdv");
      await expect(page.getByRole("heading", { name: "Escolha a loja do caixa" })).toBeVisible();
    } finally {
      await db.query("DELETE FROM cash_registers WHERE name=$1", [registerName]);
      await db.query("DELETE FROM user_stores WHERE store_id=$1", [second]);
      await db.query("DELETE FROM stores WHERE id=$1", [second]);
      await db.end();
    }
  });
  test("o administrador do sistema cria um lojista novo, que só enxerga o que é dele", async ({ page, browser }) => {
    test.skip(!process.env.DATABASE_URL, "precisa acessar o banco para dar o acesso de administrador do sistema");
    const enforced = Boolean(process.env.APP_DATABASE_URL);
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const stamp = Date.now();
    const ownerEmail = `titular-${stamp}@novolojista.test`;
    const ownerPassword = "SenhaProvisoria-2026";
    await db.query("UPDATE users SET is_platform_admin=true WHERE lower(email)=lower($1)", [adminEmail]);
    try {
      await login(page, adminEmail, seedPassword);
      await page.goto("/plataforma");
      await expect(page.getByRole("heading", { name: "Lojistas", exact: true })).toBeVisible();
      await expect(page.getByText(enforced ? "Isolamento entre lojistas no banco: ativo" : "Isolamento entre lojistas no banco: NÃO está valendo")).toBeVisible();

      await page.getByRole("button", { name: "Novo lojista" }).click();
      const form = page.getByRole("dialog");
      await form.getByLabel("Nome do lojista (cliente)").fill(`Lojista E2E ${stamp}`);
      await form.getByLabel("Nome da loja").fill("Loja Centro E2E");
      await form.getByLabel("Nome", { exact: true }).fill("Titular E2E");
      await form.getByLabel("E-mail", { exact: true }).fill(ownerEmail);
      await form.getByLabel("Senha provisória").fill(ownerPassword);
      await form.getByRole("button", { name: "Criar lojista" }).click();

      if (!enforced) {
        // sem as travas valendo, o segundo lojista é recusado com a orientação
        await expect(page.getByText("ative o isolamento do banco")).toBeVisible();
        return;
      }
      await expect(page.getByText("Lojista criado.")).toBeVisible();
      await page.getByRole("row", { name: new RegExp(`Lojista E2E ${stamp}`) }).getByRole("link", { name: "Abrir" }).click();
      await expect(page.getByRole("heading", { name: `Lojista E2E ${stamp}` })).toBeVisible();
      await page.getByRole("button", { name: "Adicionar loja" }).click();
      await page.getByRole("dialog").getByLabel("Nome da loja").fill("Loja Shopping E2E");
      await page.getByRole("dialog").getByRole("button", { name: "Adicionar loja" }).click();
      await expect(page.getByRole("cell", { name: "Loja Shopping E2E" })).toBeVisible();

      // o titular novo entra, enxerga as duas lojas dele e nada do outro lojista
      const context = await browser.newContext();
      const titular = await context.newPage();
      await login(titular, ownerEmail, ownerPassword);
      await titular.goto("/admin");
      await expect(titular.locator(".admin-footer")).toContainText("Todas as lojas (2)");
      await expect(titular.getByLabel("Loja ativa")).toBeVisible();
      await titular.goto("/admin/products");
      await expect(titular.getByText("Coca-Cola")).toHaveCount(0);
      await titular.goto("/admin/users");
      await expect(titular.getByText(adminEmail)).toHaveCount(0);
      await expect(titular.getByText(ownerEmail)).toBeVisible();
      await titular.goto("/plataforma");
      await expect(titular.getByRole("heading", { name: "Lojistas", exact: true })).toHaveCount(0);
      await context.close();

      // suspenso, o titular não entra mais
      await page.getByRole("button", { name: "Suspender" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Suspender agora" }).click();
      await expect(page.getByText("Lojista suspenso.")).toBeVisible();
      const blocked = await browser.newContext();
      const attempt = await blocked.newPage();
      await attempt.goto("/login");
      await attempt.getByLabel("E-mail corporativo").fill(ownerEmail);
      await attempt.getByLabel("Senha", { exact: true }).fill(ownerPassword);
      await attempt.getByRole("button", { name: "Entrar no sistema" }).click();
      await expect(attempt.getByText("E-mail ou senha inválidos.")).toBeVisible();
      await blocked.close();
    } finally {
      const created = await db.query<{ id: string }>("SELECT id FROM accounts WHERE name=$1", [`Lojista E2E ${stamp}`]);
      for (const { id } of created.rows) {
        await db.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE account_id=$1)", [id]);
        await db.query("DELETE FROM audit_logs WHERE account_id=$1", [id]);
        await db.query("DELETE FROM users WHERE account_id=$1", [id]);
        await db.query("DELETE FROM stores WHERE account_id=$1", [id]);
        await db.query("DELETE FROM accounts WHERE id=$1", [id]);
      }
      await db.query("UPDATE users SET is_platform_admin=false WHERE lower(email)=lower($1)", [adminEmail]);
      await db.end();
    }
  });
  test("primeiro acesso do lojista novo: o acesso guiado conduz do zero até a primeira venda", async ({ page, browser }) => {
    test.setTimeout(240_000);
    test.skip(!process.env.DATABASE_URL || !process.env.APP_DATABASE_URL, "precisa do banco e do isolamento ativo para criar um lojista novo");
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const stamp = Date.now();
    const ownerEmail = `guia-${stamp}@novolojista.test`;
    const ownerPassword = "SenhaProvisoria-2026";
    const accountName = `Lojista Guia ${stamp}`;
    await db.query("UPDATE users SET is_platform_admin=true WHERE lower(email)=lower($1)", [adminEmail]);
    try {
      await login(page, adminEmail, seedPassword);
      await page.goto("/plataforma");
      await page.getByRole("button", { name: "Novo lojista" }).click();
      const form = page.getByRole("dialog");
      await form.getByLabel("Nome do lojista (cliente)").fill(accountName);
      await form.getByLabel("Nome da loja").fill("Loja do Guia");
      await form.getByLabel("Nome", { exact: true }).fill("Titular do Guia");
      await form.getByLabel("E-mail", { exact: true }).fill(ownerEmail);
      await form.getByLabel("Senha provisória").fill(ownerPassword);
      await form.getByRole("button", { name: "Criar lojista" }).click();
      await expect(page.getByText("Lojista criado.")).toBeVisible();

      const context = await browser.newContext();
      const titular = await context.newPage();
      const title = titular.locator(".guide-bubble h3");
      const target = titular.locator(".guide-target");
      /** O balão diz o que fazer e aponta o elemento real: o teste só faz o que o balão manda. */
      const guide = (text: string) => expect(title).toHaveText(text, { timeout: 15_000 });

      // primeiro acesso: boas-vindas com os seis passos
      await signIn(titular, ownerEmail, ownerPassword);
      await expect(titular.getByRole("heading", { name: "Bem-vindo, Titular!" })).toBeVisible();
      await expect(titular.locator(".guide-welcome li")).toHaveCount(6);
      await expect(async () => { await titular.getByRole("button", { name: "Começar o acesso guiado" }).click(); await expect(titular.locator(".guide-bubble")).toBeVisible({ timeout: 3000 }); }).toPass();

      // 1. categoria
      await guide("Abra Categorias"); await target.click();
      await guide("Dê um nome à categoria"); await target.fill("Cartas avulsas");
      await guide("Salve a categoria"); await target.click();

      // 2 e 3. produto, já com estoque inicial
      await guide("Abra Produtos"); await target.click();
      await guide("Cadastre o produto"); await target.click();
      await guide("SKU do produto"); await target.fill("BOOSTER-01");
      await guide("Nome do produto"); await target.fill("Booster do Guia");
      await guide("Quanto custou"); await target.fill("6,00");
      await guide("Preço de venda"); await target.fill("10,00");
      await guide("Quantas unidades você tem?"); await target.fill("5");
      await guide("Tudo pronto"); await target.click();

      // 4. caixa (o passo do estoque já foi feito junto com o produto)
      await guide("Abra Caixas"); await target.click();
      await guide("Cadastre o caixa"); await target.click();
      await guide("Dê um nome ao caixa"); await target.fill("Caixa balcão");
      await guide("Salve o caixa"); await target.click();

      // 5. abrir o caixa
      await guide("Abra o caixa do dia"); await target.click();
      await guide("Fundo de troco"); await target.focus(); await titular.keyboard.press("Tab");
      await guide("Abra o caixa"); await target.click();

      // 6. primeira venda no PDV
      await guide("Abra o PDV"); await target.click();
      await guide("Busque o produto"); await target.fill("Booster");
      await guide("Adicione ao carrinho"); await target.click();
      await guide("Finalize a venda"); await target.click();
      const sale = titular.waitForResponse((response) => response.url().endsWith("/api/sales"));
      await guide("Confirme a venda"); await target.click();
      expect((await sale).status()).toBe(201);

      // terminou: comemora uma vez e o guia não volta
      await expect(titular.getByRole("heading", { name: "Tudo pronto, Titular!" })).toBeVisible({ timeout: 15_000 });
      await titular.getByRole("button", { name: "Concluir" }).click();
      await titular.goto("/admin");
      await expect(titular.getByRole("heading", { name: "Dashboard" })).toBeVisible();
      await expect(titular.locator(".guide-bubble, .guide-welcome, .guide-card")).toHaveCount(0);
      await titular.goto("/admin/primeiros-passos");
      await expect(titular.getByRole("heading", { name: "Tudo pronto para vender" })).toBeVisible();
      await expect(titular.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "6");
      await context.close();
    } finally {
      await db.query("UPDATE accounts SET active=false WHERE name=$1", [accountName]);
      await db.query("UPDATE users SET is_platform_admin=false WHERE lower(email)=lower($1)", [adminEmail]);
      await db.end();
    }
  });
  test("o cliente de demonstração criado pelo painel traz lojas, etiquetas, notas fiscais e vendas prontas para apresentar", async ({ page, browser }) => {
    test.setTimeout(240_000);
    test.skip(!process.env.DATABASE_URL, "precisa acessar o banco para dar o acesso de administrador do sistema");
    const enforced = Boolean(process.env.APP_DATABASE_URL);
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const stamp = Date.now();
    const email = `demo-${stamp}@coliseon.test`;
    const password = "SenhaDemonstracao-26";
    await db.query("UPDATE users SET is_platform_admin=true WHERE lower(email)=lower($1)", [adminEmail]);
    try {
      await login(page, adminEmail, seedPassword);
      await page.goto("/plataforma");
      await page.getByRole("button", { name: "Cliente de demonstração" }).click();
      const form = page.getByRole("dialog");
      await form.getByLabel("Nome do cliente").fill(`Demo E2E ${stamp}`);
      await form.getByLabel("E-mail do titular").fill(email);
      await form.getByLabel("Senha de todos os acessos").fill(password);
      await form.getByRole("button", { name: "Criar demonstração" }).click();
      if (!enforced) {
        await expect(page.getByText("ative o isolamento do banco")).toBeVisible({ timeout: 60_000 });
        return;
      }
      await expect(page.getByText("Demonstração criada:")).toBeVisible({ timeout: 120_000 });

      const titularContext = await browser.newContext();
      const titular = await titularContext.newPage();
      await login(titular, email, password);
      await titular.goto("/admin");
      await expect(titular.locator(".admin-footer")).toContainText("Todas as lojas (2)");
      // a demonstração já nasce com a loja pronta: o acesso guiado não tem o que guiar e não aparece
      await titular.locator("html[data-guide]:not([data-guide=checking])").waitFor({ state: "attached", timeout: 6000 }).catch(() => undefined);
      await expect(titular.locator(".guide-welcome, .guide-bubble")).toHaveCount(0);
      await expect(titular.getByRole("heading", { name: "Por loja" })).toBeVisible();
      await expect(titular.getByRole("cell", { name: "Loja Centro" })).toBeVisible();
      await expect(titular.getByRole("cell", { name: "Loja Shopping" })).toBeVisible();
      await titular.goto("/admin/labels");
      await expect(titular.locator(".print-label").first()).toBeVisible();
      await titular.goto("/admin/fiscal");
      await expect(titular.locator("td", { hasText: "Distribuidora Cards e Games Ltda" }).first()).toBeVisible();
      // As notas de cada loja têm o CNPJ da própria loja (não o do ambiente): todas são entradas e as pendentes aceitam a conferência.
      await titular.goto("/admin/fiscal/movements");
      const hrefs = await titular.locator("a", { hasText: "Detalhes" }).evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
      expect(hrefs.length).toBeGreaterThanOrEqual(6);
      let pending: string | null = null;
      for (const href of hrefs) {
        await titular.goto(href);
        await expect(titular.getByText("Nota sem entrada de estoque")).toHaveCount(0);
        if (!pending && (await titular.getByRole("button", { name: "Dar entrada no estoque" }).count())) pending = href;
      }
      expect(pending, "nenhuma nota pendente oferece 'Dar entrada no estoque'").not.toBeNull();
      await titular.goto(pending!);
      await titular.getByRole("button", { name: "Dar entrada no estoque" }).click();
      await titular.getByRole("dialog").getByRole("button", { name: "Confirmar conferência" }).click();
      await expect(titular.getByText("Entrada concluída")).toBeVisible({ timeout: 30_000 });
      await titular.goto("/admin/products");
      await expect(titular.getByText("Play Booster Bloomburrow").first()).toBeVisible();
      // cada loja com os seus produtos: a Shopping não trabalha com cartas avulsas
      await chooseStore(titular, "Loja Centro");
      await expect(titular.locator(".stock-scope")).toContainText("Loja Centro");
      await expect(titular.getByText("Carta avulsa — Anel Solar (NM)")).toBeVisible();
      await chooseStore(titular, "Loja Shopping");
      await expect(titular.locator(".stock-scope")).toContainText("Loja Shopping");
      await expect(titular.getByText("Play Booster Bloomburrow").first()).toBeVisible();
      await expect(titular.getByText("Carta avulsa — Anel Solar (NM)")).toHaveCount(0);
      await titularContext.close();

      const managerContext = await browser.newContext();
      const manager = await managerContext.newPage();
      await login(manager, email.replace("@", "+gerente-shopping@"), password);
      await manager.goto("/admin");
      await expect(manager.locator(".admin-footer")).toContainText("Loja Shopping");
      await expect(manager.getByLabel("Loja ativa")).toHaveCount(0);
      await managerContext.close();
    } finally {
      await db.query("UPDATE accounts SET active=false WHERE name=$1", [`Demo E2E ${stamp}`]);
      await db.query("UPDATE users SET is_platform_admin=false WHERE lower(email)=lower($1)", [adminEmail]);
      await db.end();
    }
  });
  test("o código do 2FA só é pedido num segundo passo, depois da senha, e só para quem tem 2FA ativo", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL || !(process.env.TOTP_ENCRYPTION_KEY ?? process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY), "precisa do banco e da chave do 2FA no mesmo ambiente do servidor");
    const secret = generateTotpSecret();
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query("UPDATE users SET totp_enabled=true, totp_secret_encrypted=$2 WHERE lower(email)=lower($1)", [operatorEmail, encryptTotpSecret(secret)]);
    const fillCredentials = async (password: string) => {
      await page.getByLabel("E-mail corporativo").fill(operatorEmail);
      await page.getByLabel("Senha", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar no sistema" }).click();
    };
    try {
      // A primeira tela não mostra o campo do código.
      await page.goto("/login");
      await expect(page.getByLabel(/Código/)).toHaveCount(0);
      await expect(page.getByText("2FA")).toHaveCount(0);

      // Senha errada: erro genérico, sem revelar que a conta tem 2FA.
      await fillCredentials("senha-errada-123");
      await expect(page.locator(".login-form .notice-error")).toContainText("E-mail ou senha inválidos.");
      await expect(page.getByLabel("Código de verificação")).toHaveCount(0);

      // Senha certa: aparece o segundo passo. Um código errado é recusado, e "Voltar" retorna à senha (campo vazio).
      await fillCredentials(operatorPassword);
      await expect(page.getByText("Verificação em duas etapas")).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
      const valid = new Set([-30_000, 0, 30_000].map((shift) => generateTotpCode(secret, Date.now() + shift)));
      const wrong = Array.from({ length: 10 }, (_, index) => String(111111 * index).padStart(6, "0")).find((code) => !valid.has(code))!;
      await page.getByLabel("Código de verificação").fill(wrong);
      await page.getByRole("button", { name: "Entrar no sistema" }).click();
      await expect(page.locator(".login-form .notice-error")).toContainText("Código de autenticação em duas etapas inválido.");
      await page.getByRole("button", { name: "Voltar" }).click();
      await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Código de verificação")).toHaveCount(0);
      await expect(page.locator(".login-form .notice-error")).toHaveCount(0);

      // Senha de novo e o código certo: entra.
      await fillCredentials(operatorPassword);
      await page.getByLabel("Código de verificação").fill(generateTotpCode(secret));
      await page.getByRole("button", { name: "Entrar no sistema" }).click();
      await page.waitForURL((url) => url.pathname !== "/login");
      await expect(page).toHaveURL(/\/pdv/);
    } finally {
      await db.query("UPDATE users SET totp_enabled=false, totp_secret_encrypted=NULL WHERE lower(email)=lower($1)", [operatorEmail]);
      await db.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email)=lower($1))", [operatorEmail]);
      await db.end();
    }
  });
  test("comandas: o cliente escaneia o QR, pede pelo celular dentro da loja, o balcão cobra no PDV e completa o cadastro", async ({ page, browser, baseURL }) => {
    test.setTimeout(240_000);
    test.skip(!process.env.COMANDA_LINK_SECRET, "precisa do mesmo COMANDA_LINK_SECRET do servidor para montar o link do QR");
    const store = { latitude: -23.55052, longitude: -46.633308 };
    const product = "Refrigerante Coca-Cola 2L";
    await login(page, adminEmail, seedPassword);

    // 1. o administrador liga as comandas, define onde a loja fica, cadastra 3 comandas e monta o cardápio do celular
    await page.goto("/admin/comandas/configuracoes");
    await page.getByLabel("Latitude").fill(String(store.latitude));
    await page.getByLabel("Longitude").fill(String(store.longitude));
    await page.getByLabel(/Raio permitido/).fill("150");
    await page.getByLabel(/Receber pedidos pelo celular/).check();
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(page.getByText("Configurações salvas.")).toBeVisible();

    // cada execução cadastra uma comanda de número novo, para o teste não depender do que sobrou de execuções anteriores
    const number = 1000 + Math.floor(Math.random() * 8000);
    await page.goto("/admin/comandas/cadastro");
    await page.getByLabel("Da comanda número").fill(String(number));
    await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
    await expect(page.getByText("1 comanda(s) cadastrada(s).")).toBeVisible();

    await page.goto("/admin/comandas/cardapio");
    await page.getByRole("checkbox", { name: new RegExp(product) }).check();
    await page.getByRole("button", { name: "Salvar cardápio" }).click();
    await expect(page.getByText(/Cardápio salvo/)).toBeVisible();

    await page.goto("/admin/comandas/qrcodes");
    await expect(page.locator(".qr-card").filter({ hasText: String(number) }).locator("svg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimir QR Codes" })).toBeVisible();

    // 2. o balcão abre a comanda para um cliente sem cadastro (cadastro provisório)
    await page.goto("/admin/comandas");
    const card = page.locator(".comanda-card.is-free").filter({ has: page.locator(".comanda-number", { hasText: new RegExp(`^${number}$`) }) });
    await card.getByRole("button", { name: "Abrir" }).click();
    await page.getByRole("tab", { name: "Cadastro provisório" }).click();
    await page.getByLabel("Nome do cliente").fill("Cliente E2E");
    await page.getByRole("button", { name: "Abrir comanda" }).click();
    await expect(page).toHaveURL(/\/admin\/comandas\/[0-9a-f-]{36}$/);
    const comandaId = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Comanda ${number}`);
    const link = `${baseURL}/pedidos/${signComandaToken(comandaId, 1)}`;
    await expect(page.getByText("Cadastro provisório").first()).toBeVisible();

    // 3. o cliente (celular) escaneia o QR. Sem permitir a localização, ou longe da loja, o pedido é barrado
    const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;
    const denied = await browser.newContext({ ...mobile, permissions: [] });
    const deniedPage = await denied.newPage();
    await deniedPage.goto(link);
    await expect(deniedPage.getByRole("heading", { name: `Comanda ${number}` })).toBeVisible();
    await deniedPage.getByRole("button", { name: "Permitir localização e continuar" }).click();
    await expect(deniedPage.locator(".cmd-alert")).toContainText(/permitir a localiza/i);
    await denied.close();

    const far = await browser.newContext({ ...mobile, permissions: ["geolocation"], geolocation: { latitude: -23.4, longitude: -46.8 } });
    const farPage = await far.newPage();
    await farPage.goto(link);
    await farPage.getByRole("button", { name: "Permitir localização e continuar" }).click();
    await expect(farPage.locator(".cmd-alert")).toContainText(/longe da loja/i);
    await far.close();

    const customerContext = await browser.newContext({ ...mobile, permissions: ["geolocation"], geolocation: { ...store, accuracy: 15 } });
    const customer = await customerContext.newPage();
    await customer.goto(link);
    await customer.getByRole("button", { name: "Permitir localização e continuar" }).click();
    await expect(customer.getByText(/Olá,/)).toContainText("Cliente");
    const row = customer.locator("article.cmd-item", { hasText: product });
    await expect(row).toBeVisible();
    await expect(customer.getByText("Carta avulsa")).toHaveCount(0); // só o que está no cardápio
    await row.getByRole("button", { name: `Adicionar ${product}` }).click();
    await row.getByRole("button", { name: `Adicionar ${product}` }).click();
    await customer.getByRole("button", { name: /Revisar pedido/ }).click();
    await customer.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(customer.locator(".cmd-ok")).toContainText("Pedido enviado");
    await expect(customer.getByText("2× " + product)).toBeVisible();
    await expect(customer.locator(".cmd-total strong")).toHaveText(/18,00/);

    // 4. o balcão vê o pedido, marca como entregue e cobra a conta no PDV
    await page.goto(`/admin/comandas/${comandaId}`);
    const orders = page.getByRole("region", { name: "Pedidos" });
    await expect(orders.getByText("Pedido do cliente")).toBeVisible();
    await expect(orders.getByText("2× " + product)).toBeVisible();
    await page.getByRole("button", { name: "Marcar entregue" }).click();
    await expect(page.getByText("Pedido marcado como entregue.").or(page.locator(".order-card.is-delivered"))).toBeVisible();
    await page.getByRole("link", { name: "Cobrar no PDV" }).click();
    await expect(page).toHaveURL(/\/pdv\?comanda=/);
    await expect(page.getByText(`Cobrando a comanda ${number}`)).toBeVisible();
    await expect(page.getByPlaceholder("Nome, SKU ou código de barras")).toHaveCount(0); // o carrinho é a conta, só leitura
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    const sale = page.waitForResponse((response) => response.url().endsWith("/api/sales"));
    await page.getByRole("button", { name: "Confirmar venda" }).click();
    expect((await sale).status()).toBe(201);
    await expect(page.getByText("Venda concluída")).toBeVisible();

    // 5. ao fechar, o sistema oferece completar o cadastro provisório
    await expect(page.getByText("Complete o cadastro de Cliente E2E")).toBeVisible();
    await page.getByLabel("Telefone").fill("11988887777");
    await page.getByRole("button", { name: "Salvar cadastro completo" }).click();
    await expect(page.getByText("Cadastro completo.")).toBeVisible();
    await page.locator("section", { hasText: "Venda concluída" }).getByRole("link", { name: "Voltar às comandas" }).click();
    await expect(page.locator(".comanda-card.is-free").filter({ has: page.locator(".comanda-number", { hasText: new RegExp(`^${number}$`) }) })).toBeVisible();

    // 6. com a comanda fechada, o cliente não consegue mais pedir; a auditoria tem tudo
    await customer.reload();
    await expect(customer.getByRole("heading", { name: `Comanda ${number} fechada` })).toBeVisible();
    await customerContext.close();
    await page.goto("/admin/comandas/auditoria");
    const audit = page.locator("table");
    await expect(audit.getByText("Pedido do cliente").first()).toBeVisible();
    await expect(audit.getByText("Acesso barrado").first()).toBeVisible();
    await expect(audit.getByText("Localização recusada").first()).toBeVisible();
    await expect(audit.getByText("Fora do raio da loja").first()).toBeVisible();
    await expect(audit.getByText("Conta cobrada (comanda fechada)").first()).toBeVisible();
  });
  test("comandas: a configuração consegue pedir a localização mesmo chegando pelas abas do painel", async ({ browser, baseURL }) => {
    test.skip(!process.env.DATABASE_URL, "precisa do banco para pular as boas-vindas do acesso guiado");
    // A permissão de localização vale pelo cabeçalho da página carregada por inteiro: a aba Configurações tem de recarregar a página.
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const adminId = (await db.query<{ id: string }>("SELECT id FROM users WHERE lower(email)=lower($1)", [adminEmail])).rows[0].id;
    await db.end();
    const context = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: -23.55052, longitude: -46.633308, accuracy: 20 } });
    await context.addCookies([{ name: `coliseu_guide_${adminId.replace(/-/g, "").slice(0, 16)}`, value: "dismissed", url: baseURL! }]);
    const page = await context.newPage();
    await signIn(page, adminEmail, seedPassword);
    await page.goto("/admin/comandas");
    await page.getByRole("link", { name: "Configurações", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/comandas\/configuracoes$/);
    await page.getByRole("button", { name: "Usar minha localização atual" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Localização preenchida" })).toBeVisible();
    await expect(page.getByLabel("Latitude")).toHaveValue(/^-23\.55/);
    await context.close();
  });
  test("o administrador do sistema criado pelo script, sem lojista, entra direto no painel do sistema", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "precisa acessar o banco para criar o usuário pelo script");
    const email = `sistema-${Date.now()}@e2e.test`;
    const password = "SenhaDoSistema-2026";
    const env = { ...process.env, MIGRATION_DATABASE_URL: "", PLATFORM_ADMIN_PASSWORD: password };
    execFileSync(process.execPath, ["scripts/platform-admin.mjs", `--email=${email}`, "--create", "--name=Dono do Sistema E2E", "--apply"], { env, stdio: "pipe" });
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      await login(page, email, password);
      await expect(page).toHaveURL(/\/plataforma/);
      await expect(page.getByRole("heading", { name: "Lojistas", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Minha loja" })).toHaveCount(0);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/plataforma/);
      await page.goto("/pdv");
      await expect(page).toHaveURL(/\/plataforma/);
    } finally {
      await db.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email=$1)", [email]);
      await db.query("DELETE FROM users WHERE email=$1", [email]);
      await db.end();
    }
  });
});
