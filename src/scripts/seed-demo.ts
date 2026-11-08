import "dotenv/config";
import { randomBytes } from "node:crypto";
import { pool } from "@/db";
import { createDemoAccount } from "@/modules/platform/demo";

/* Cria o cliente de demonstração por linha de comando (desenvolvimento e o serviço `migrate` do compose, que têm tsx).
 * Em produção use o botão "Cliente de demonstração" do painel do sistema.
 *   DEMO_OWNER_EMAIL   e-mail do titular (padrão demo@coliseon.test)
 *   DEMO_PASSWORD      senha de todos os acessos (se faltar, gera uma e mostra uma única vez)
 *   DEMO_SKIP_ISOLATION_CHECK=true   só para desenvolvimento: dispensa a exigência das travas do banco para criar o segundo lojista */
const email = process.env.DEMO_OWNER_EMAIL?.trim() || "demo@coliseon.test";
const generated = !process.env.DEMO_PASSWORD;
const password = process.env.DEMO_PASSWORD || randomBytes(12).toString("base64url");

const actor = (await pool.query<{ id: string }>("SELECT id FROM users WHERE active ORDER BY is_platform_admin DESC,created_at LIMIT 1")).rows[0]?.id;
if (!actor) { console.error("Crie ao menos um usuário antes (npm run db:seed)."); process.exit(1); }

try {
  const result = await createDemoAccount({ ownerEmail: email, password }, actor, { skipIsolationCheck: process.env.DEMO_SKIP_ISOLATION_CHECK === "true" });
  console.log(`\nCliente de demonstração criado: ${result.accountName}`);
  console.log(`Lojas: ${result.counts.stores} | produtos: ${result.counts.products} | jogadores: ${result.counts.players} | notas fiscais: ${result.counts.invoices} | vendas: ${result.counts.sales} (${result.counts.canceled} canceladas) | duplicatas: ${result.counts.payables}`);
  if (result.failures.length) console.log(`Vendas recusadas durante a geração: ${result.failures.join(" | ")}`);
  console.log("\nAcessos (todos com a mesma senha):");
  for (const login of result.logins) console.log(`  ${login.email.padEnd(48)} ${login.role} · ${login.stores}`);
  console.log(generated ? `\nSenha (aparece só agora, anote): ${password}` : "\nSenha: a que você informou em DEMO_PASSWORD.");
  await pool.end();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
}
