/* Dá (ou tira) o acesso de administrador do sistema a um usuário. Esse acesso abre o painel /plataforma: criar lojistas,
 * adicionar lojas, suspender contas. Quem o tem não enxerga vendas, estoque nem financeiro dos lojistas.
 *
 * Uso (no terminal do app):
 *   node scripts/platform-admin.mjs --email=voce@empresa.com            # simulação: mostra o que faria
 *   node scripts/platform-admin.mjs --email=voce@empresa.com --apply    # concede
 *   node scripts/platform-admin.mjs --email=voce@empresa.com --remove --apply   # revoga
 * Usa MIGRATION_DATABASE_URL ou DATABASE_URL (o dono do banco, que não sofre as travas). */
import pg from "pg";

const args = process.argv.slice(2);
const email = args.find((arg) => arg.startsWith("--email="))?.slice("--email=".length).trim().toLowerCase();
const apply = args.includes("--apply");
const remove = args.includes("--remove");
const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL não está configurada."); process.exit(1); }
if (!email || !email.includes("@")) { console.error("Informe o e-mail: --email=voce@empresa.com"); process.exit(1); }

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const user = (await client.query("SELECT u.id,u.name,u.active,u.is_platform_admin,u.account_id,a.name AS account FROM users u LEFT JOIN accounts a ON a.id=u.account_id WHERE lower(u.email)=$1", [email])).rows[0];
  if (!user) { console.error(`Nenhum usuário com o e-mail ${email}.`); process.exitCode = 1; }
  else {
    const target = !remove;
    console.log(`Usuário: ${user.name} | lojista: ${user.account ?? "nenhum (só administrador do sistema)"} | ativo: ${user.active} | administrador do sistema hoje: ${user.is_platform_admin}`);
    if (user.is_platform_admin === target) console.log(target ? "\nJá é administrador do sistema. Nada a fazer." : "\nJá não é administrador do sistema. Nada a fazer.");
    else if (!remove && !user.active) { console.error("\nO usuário está inativo."); process.exitCode = 1; }
    else if (!apply) console.log(`\nSimulação: NADA foi alterado. Rode com --apply para ${remove ? "revogar" : "conceder"} o acesso.`);
    else {
      if (remove && user.account_id === null) { console.error("\nEste usuário não pertence a nenhum lojista: revogar o deixaria sem acesso a nada. Cancelado."); process.exitCode = 1; }
      else {
        await client.query("BEGIN");
        await client.query("UPDATE users SET is_platform_admin=$1,updated_at=now() WHERE id=$2", [target, user.id]);
        await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after,account_id) VALUES (NULL,$1,'user',$2,$3,NULL)", [target ? "PLATFORM_ADMIN_GRANT" : "PLATFORM_ADMIN_REVOKE", user.id, JSON.stringify({ email })]);
        await client.query("COMMIT");
        console.log(`\nConcluído: ${target ? "agora é administrador do sistema. O painel fica em /plataforma." : "deixou de ser administrador do sistema."}`);
      }
    }
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Não foi possível concluir.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally { await client.end(); }
