/* Administrador do sistema: o acesso ao painel /plataforma (criar lojistas, adicionar lojas, suspender contas). Quem o tem não
 * enxerga vendas, estoque nem financeiro dos lojistas. Roda no terminal do app, com o usuário dono do banco
 * (MIGRATION_DATABASE_URL ou DATABASE_URL), e SIMULA por padrão: só altera com --apply.
 *
 *   # criar o seu usuário de administrador do sistema (não precisa existir antes)
 *   PLATFORM_ADMIN_PASSWORD='uma senha sua com 10+ caracteres' \
 *     node scripts/platform-admin.mjs --email=voce@empresa.com --create --name="Seu Nome" --apply
 *   # sem PLATFORM_ADMIN_PASSWORD, o script gera uma senha forte e a mostra uma única vez
 *
 *   # dar o acesso a um usuário que já existe, ou tirar
 *   node scripts/platform-admin.mjs --email=voce@empresa.com --apply
 *   node scripts/platform-admin.mjs --email=voce@empresa.com --remove --apply
 *
 *   # definir uma nova senha (esqueceu a senha) e encerrar as sessões abertas
 *   node scripts/platform-admin.mjs --email=voce@empresa.com --reset-password --apply
 *
 * Um usuário criado aqui não pertence a nenhum lojista: ao entrar, cai direto em /plataforma. */
import { randomBytes } from "node:crypto";
import pg from "pg";

const args = process.argv.slice(2);
const email = args.find((arg) => arg.startsWith("--email="))?.slice("--email=".length).trim().toLowerCase();
const name = args.find((arg) => arg.startsWith("--name="))?.slice("--name=".length).trim();
const apply = args.includes("--apply");
const remove = args.includes("--remove");
const create = args.includes("--create");
const resetPassword = args.includes("--reset-password");
const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL não está configurada."); process.exit(1); }
if (!email || !email.includes("@")) { console.error("Informe o e-mail: --email=voce@empresa.com"); process.exit(1); }

/** Senha vinda do ambiente (nunca da linha de comando) ou gerada; devolve também se foi gerada, para mostrar uma única vez. */
function chooseSecret() {
  const given = process.env.PLATFORM_ADMIN_PASSWORD;
  if (given !== undefined && given !== "") {
    if (given.length < 10) { console.error("PLATFORM_ADMIN_PASSWORD deve ter pelo menos 10 caracteres."); process.exit(1); }
    return { password: given, generated: false };
  }
  return { password: randomBytes(15).toString("base64url"), generated: true };
}
const hashPassword = async (password) => (await import("bcryptjs")).hash(password, 12);
const credentials = ({ password, generated }) => generated ? `\nSenha provisória (aparece só agora, anote): ${password}` : "\nA senha é a que você informou em PLATFORM_ADMIN_PASSWORD.";

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const user = (await client.query("SELECT u.id,u.name,u.active,u.is_platform_admin,u.account_id,a.name AS account FROM users u LEFT JOIN accounts a ON a.id=u.account_id WHERE lower(u.email)=$1", [email])).rows[0];

  if (!user) {
    if (!create) { console.error(`Nenhum usuário com o e-mail ${email}. Para criá-lo como administrador do sistema, acrescente --create --name="Seu Nome".`); process.exitCode = 1; }
    else if (!name || name.length < 2) { console.error('Informe o nome do novo usuário: --name="Seu Nome"'); process.exitCode = 1; }
    else if (!apply) console.log(`Simulação: criaria o administrador do sistema ${name} <${email}>, sem lojista (entra direto em /plataforma). NADA foi alterado. Rode com --apply.`);
    else {
      const secret = chooseSecret();
      await client.query("BEGIN");
      // account_id NULL explícito: sem ele o banco poderia preencher a conta única do sistema.
      const id = (await client.query("INSERT INTO users (name,email,password_hash,role,account_id,is_platform_admin) VALUES ($1,$2,$3,'ADMIN',NULL,true) RETURNING id", [name, email, await hashPassword(secret.password)])).rows[0].id;
      await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after,account_id) VALUES (NULL,'PLATFORM_ADMIN_CREATE','user',$1,$2,NULL)", [id, JSON.stringify({ email })]);
      await client.query("COMMIT");
      console.log(`Concluído: administrador do sistema criado.\nE-mail: ${email}${credentials(secret)}\nEntre pela tela de login; você cai direto no painel do sistema (/plataforma).`);
    }
  } else if (resetPassword) {
    console.log(`Usuário: ${user.name} | lojista: ${user.account ?? "nenhum"} | ativo: ${user.active}`);
    if (!apply) console.log("\nSimulação: NADA foi alterado. Rode com --apply para definir uma nova senha e encerrar as sessões abertas.");
    else {
      const secret = chooseSecret();
      await client.query("BEGIN");
      await client.query("UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2", [await hashPassword(secret.password), user.id]);
      await client.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after,account_id) VALUES (NULL,'PLATFORM_ADMIN_PASSWORD_RESET','user',$1,$2,$3)", [user.id, JSON.stringify({ email }), user.account_id]);
      await client.query("COMMIT");
      console.log(`Concluído: senha redefinida e sessões encerradas.${credentials(secret)}`);
    }
  } else {
    const target = !remove;
    console.log(`Usuário: ${user.name} | lojista: ${user.account ?? "nenhum (só administrador do sistema)"} | ativo: ${user.active} | administrador do sistema hoje: ${user.is_platform_admin}`);
    if (user.is_platform_admin === target) console.log(target ? "\nJá é administrador do sistema. Nada a fazer." : "\nJá não é administrador do sistema. Nada a fazer.");
    else if (!remove && !user.active) { console.error("\nO usuário está inativo."); process.exitCode = 1; }
    else if (!apply) console.log(`\nSimulação: NADA foi alterado. Rode com --apply para ${remove ? "revogar" : "conceder"} o acesso.`);
    else if (remove && user.account_id === null) { console.error("\nEste usuário não pertence a nenhum lojista: revogar o deixaria sem acesso a nada. Cancelado."); process.exitCode = 1; }
    else {
      await client.query("BEGIN");
      await client.query("UPDATE users SET is_platform_admin=$1,updated_at=now() WHERE id=$2", [target, user.id]);
      await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after,account_id) VALUES (NULL,$1,'user',$2,$3,NULL)", [target ? "PLATFORM_ADMIN_GRANT" : "PLATFORM_ADMIN_REVOKE", user.id, JSON.stringify({ email })]);
      await client.query("COMMIT");
      console.log(`\nConcluído: ${target ? "agora é administrador do sistema. O painel fica em /plataforma." : "deixou de ser administrador do sistema."}`);
    }
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Não foi possível concluir.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally { await client.end(); }
