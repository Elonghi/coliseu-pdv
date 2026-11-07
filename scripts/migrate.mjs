/* Aplica as migrations do banco (pasta drizzle/) sem precisar de tsx nem do código-fonte, para rodar no terminal do app
 * em produção. Segue o mesmo algoritmo do migrador do Drizzle (mesma tabela drizzle.__drizzle_migrations, mesmo hash,
 * uma única transação), então é intercambiável com `npm run db:migrate`.
 *
 * Uso:
 *   node scripts/migrate.mjs            # só mostra o que está pendente; não altera nada
 *   node scripts/migrate.mjs --apply    # aplica as pendentes (faça o backup antes)
 * Variáveis: DATABASE_URL (ou MIGRATION_DATABASE_URL, que tem prioridade: use-a quando o app conectar com um papel
 * sem privilégio de DDL), MIGRATIONS_FOLDER (padrão: drizzle). */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const apply = process.argv.slice(2).includes("--apply");
const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL não está configurada.");
  process.exit(1);
}

const folder = path.resolve(process.env.MIGRATIONS_FOLDER || "drizzle");
const journalPath = path.join(folder, "meta", "_journal.json");
if (!existsSync(journalPath)) {
  console.error(`Não encontrei ${journalPath}. A pasta de migrations não está na imagem?`);
  process.exit(1);
}
const migrations = JSON.parse(readFileSync(journalPath, "utf8")).entries.map((entry) => {
  const file = path.join(folder, `${entry.tag}.sql`);
  if (!existsSync(file)) {
    console.error(`Arquivo ${file} não encontrado.`);
    process.exit(1);
  }
  const text = readFileSync(file, "utf8");
  return { tag: entry.tag, when: entry.when, hash: createHash("sha256").update(text).digest("hex"), statements: text.split("--> statement-breakpoint") };
});

const target = new URL(connectionString);
console.log(`Banco: ${target.hostname}:${target.port || 5432}/${decodeURIComponent(target.pathname.replace(/^\//, ""))}`);
console.log(apply ? "MODO: APLICAR\n" : "MODO: CONSULTA (nada será alterado; use --apply para aplicar)\n");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const findPending = async () => {
    const hasTable = (await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok")).rows[0].ok;
    const last = hasTable ? (await client.query("SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1")).rows[0] : undefined;
    return migrations.filter((migration) => !last || Number(last.created_at) < migration.when);
  };
  const pending = await findPending();
  const applied = migrations.length - pending.length;
  console.log(`Migrations no código: ${migrations.length} | já aplicadas: ${applied} | pendentes: ${pending.length}`);
  for (const migration of pending) console.log(`  pendente: ${migration.tag}`);

  if (!pending.length) {
    console.log("\nNenhuma migration pendente.");
  } else if (!apply) {
    console.log("\nConsulta concluída: NADA foi alterado. Faça o backup e rode com --apply para aplicar.");
  } else {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('coliseu-migrate'))");
    await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await client.query('CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    // Recalcula já travado: se outra execução aplicou algo nesse meio tempo, não repete.
    for (const migration of await findPending()) {
      for (const statement of migration.statements) await client.query(statement);
      await client.query('INSERT INTO "drizzle"."__drizzle_migrations" ("hash","created_at") VALUES ($1,$2)', [migration.hash, migration.when]);
      console.log(`  aplicada: ${migration.tag}`);
    }
    await client.query("COMMIT");
    console.log("\nMigrations aplicadas.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("A migration falhou e nenhuma alteração foi gravada.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
