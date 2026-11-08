import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@coliseu.local";
const operatorEmail = process.env.SEED_OPERATOR_EMAIL ?? "operador@coliseu.local";
const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? "TroqueEstaSenha123!";
const operatorPassword = process.env.SEED_OPERATOR_PASSWORD ?? "TroqueEstaSenha123!";
const playerName = `Jogador E2E ${Date.now()}`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
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
      await page.getByRole("button", { name: "Novo caixa" }).click();
      await page.getByRole("dialog").getByLabel("Nome").fill(registerName);
      await page.getByRole("dialog").getByRole("button", { name: "Cadastrar caixa" }).click();
      await expect.poll(async () => (await db.query<{ store_id: string }>("SELECT store_id FROM cash_registers WHERE name=$1", [registerName])).rows[0]?.store_id).toBe(second);

      // o PDV não funciona na visão de todas as lojas
      await switcher.selectOption({ label: "Todas as lojas" });
      await expect(page.locator(".admin-footer")).toContainText("Todas as lojas (2)");
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
