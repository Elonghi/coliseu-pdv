import type { Pool } from "pg";

/* Deixa o banco de teste com exatamente uma conta (lojista) e uma loja, como em produção hoje: os padrões
 * app_current_account() e app_current_store() dependem disso. Chame no começo do beforeEach: o TRUNCATE em cascata
 * também limpa tudo que depende de conta e loja. */
export async function resetTenancy(db: Pick<Pool, "query">) {
  await db.query("TRUNCATE accounts RESTART IDENTITY CASCADE");
  const account = (await db.query<{ id: string }>("INSERT INTO accounts (name) VALUES ('Lojista de teste') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO stores (account_id,name) VALUES ($1,'Loja de teste')", [account]);
}
