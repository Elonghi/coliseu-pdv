import "dotenv/config";
import { pool } from "@/db";
import { defaultStoreBackfill } from "@/db/default-store";

/* Vincula à conta e à loja inicial os usuários que ficaram sem vínculo (por exemplo, criados pelo painel entre a
 * migration 0014 e o código que usa as lojas). Seguro para repetir: não altera conta, loja nem vínculo existentes. */
const unlinked = async () => (await pool.query<{ total: number }>(
  "SELECT count(*)::int total FROM users u WHERE u.account_id IS NULL OR NOT EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id=u.id)")).rows[0].total;

const before = await unlinked();
for (const statement of defaultStoreBackfill) await pool.query(statement);
console.log(`Usuários sem conta ou sem loja: ${before} -> ${await unlinked()}`);
await pool.end();
