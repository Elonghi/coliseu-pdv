import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@coliseu.local";
const operatorEmail = process.env.SEED_OPERATOR_EMAIL ?? "operador@coliseu.local";
const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? "TroqueEstaSenha123!";
const operatorPassword = process.env.SEED_OPERATOR_PASSWORD ?? "TroqueEstaSenha123!";
const playerName = `Jogador E2E ${Date.now()}`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

test.describe.serial("fluxos essenciais", () => {
  test("administrador entra e visualiza o dashboard", async ({ page }) => {
    await login(page, adminEmail, seedPassword);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Faturamento — últimos 14 dias")).toBeVisible();
    await expect(page.getByText("Fluxo financeiro realizado — últimos 14 dias")).toBeVisible();
  });

  test("administrador cadastra jogador para uso de crédito", async ({ page }) => {
    await login(page, adminEmail, seedPassword);
    await page.goto("/admin/players");
    const createForm = page.locator("main form").first();
    await createForm.getByLabel("Nome").fill(playerName);
    await createForm.getByLabel("E-mail").fill(`jogador-e2e-${Date.now()}@coliseu.local`);
    await createForm.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("heading", { name: playerName })).toBeVisible();
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
