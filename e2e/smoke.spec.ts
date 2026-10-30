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
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Coliseu PDV/);
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
    expect(manifest).toMatchObject({ name: "Coliseu PDV & Gestão", display: "standalone", start_url: "/login", lang: "pt-BR" });
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
});
