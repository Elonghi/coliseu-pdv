/* Cria (ou atualiza a senha de) o papel de banco usado pela aplicação, sem privilégio de administrador.
 *
 * Por que: o usuário do Postgres criado pelo compose é superusuário, e superusuário ignora RLS (Row-Level Security).
 * O isolamento entre contas e lojas (docs/PLANO_MULTI_LOJA.md) só vale se o app conectar com um papel comum.
 * Este script só prepara o papel; trocar a DATABASE_URL do app para ele é a fase 5 do plano.
 *
 * Uso (como o mesmo usuário que roda as migrações, para os privilégios padrão valerem para tabelas futuras):
 *   APP_DB_PASSWORD='<senha forte de 24+ caracteres>' node scripts/create-app-role.mjs
 * Variáveis: DATABASE_URL (dono/superusuário), APP_DB_PASSWORD (obrigatória), APP_DB_ROLE (padrão coliseu_app).
 * Pode ser repetido: recria os privilégios e troca a senha. A senha não é impressa nem enviada em texto puro ao banco
 * (vai como verificador SCRAM-SHA-256), então não aparece em log de statements. */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import pg from "pg";

const role = process.env.APP_DB_ROLE || "coliseu_app";
const password = process.env.APP_DB_PASSWORD ?? "";

const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) fail("DATABASE_URL não está configurada.");
if (!/^[a-z_][a-z0-9_]{0,40}$/.test(role)) fail("APP_DB_ROLE inválido: use letras minúsculas, números e _ (até 41 caracteres).");
if (!/^[\x21-\x7e]{24,}$/.test(password)) fail("APP_DB_PASSWORD deve ter 24 ou mais caracteres, sem espaços (ex.: openssl rand -base64 36).");

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Verificador SCRAM-SHA-256 no formato que o Postgres aceita no lugar da senha em texto. */
function scramVerifier(secret) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
  const salted = pbkdf2Sync(secret, salt, iterations, 32, "sha256");
  const storedKey = createHash("sha256").update(hmac(salted, "Client Key")).digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${hmac(salted, "Server Key").toString("base64")}`;
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const me = (await client.query("SELECT current_user AS name, current_database() AS db, (rolsuper OR rolcreaterole) AS can FROM pg_roles WHERE rolname=current_user")).rows[0];
  if (!me.can) fail(`O usuário ${me.name} não pode criar papéis. Rode com o usuário dono do banco.`);
  if (me.name === role) fail("APP_DB_ROLE não pode ser o mesmo usuário que roda as migrações.");

  const id = (value) => client.escapeIdentifier(value);
  const exists = (await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount > 0;
  const flags = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS";
  const verifier = client.escapeLiteral(scramVerifier(password));

  await client.query("BEGIN");
  await client.query(`${exists ? "ALTER" : "CREATE"} ROLE ${id(role)} WITH ${flags} PASSWORD ${verifier}`);
  await client.query(`GRANT CONNECT ON DATABASE ${id(me.db)} TO ${id(role)}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${id(role)}`);
  await client.query(`REVOKE CREATE ON SCHEMA public FROM ${id(role)}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${id(role)}`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${id(role)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${id(me.name)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${id(role)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${id(me.name)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${id(role)}`);
  // Só leitura do controle de migrations: o painel do sistema compara o que o banco aplicou com o que o código espera.
  if ((await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok")).rows[0].ok) {
    await client.query(`GRANT USAGE ON SCHEMA drizzle TO ${id(role)}`);
    await client.query(`GRANT SELECT ON drizzle.__drizzle_migrations TO ${id(role)}`);
  }
  await client.query("COMMIT");

  const check = (await client.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1", [role])).rows[0];
  console.log(`Papel "${role}" ${exists ? "atualizado" : "criado"} no banco "${me.db}" (superusuário: ${check.rolsuper}, ignora RLS: ${check.rolbypassrls}).`);
  console.log(`Permissões: leitura e escrita nas tabelas de dados (inclusive as criadas pelas próximas migrações de "${me.name}"); sem DDL; só leitura do controle de migrações.`);
  console.log(`URL para a aplicação (fase 5): postgresql://${role}:<APP_DB_PASSWORD>@<host>:5432/${me.db}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Não foi possível preparar o papel. Nenhuma alteração foi gravada.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
