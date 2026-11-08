import type { Pool, PoolClient } from "pg";
import type { Permission } from "./permissions";
import { accessibleStoresJson, type StoreSummary } from "./stores";

type Queryable = Pick<Pool | PoolClient, "query">;

export type LoadedSessionUser = {
  id: string; name: string; email: string; role: "ADMIN" | "OPERATOR"; permissions: Permission[];
  accountId: string | null; isAccountOwner: boolean; isPlatformAdmin: boolean; stores: StoreSummary[];
};

const undefinedColumn = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: string }).code === "42703";

/* Entre o deploy do código novo e a aplicação das migrations, a coluna users.is_platform_admin ainda não existe. Sem ela,
 * ninguém é administrador do sistema, e o aviso de "atualização em andamento" consegue aparecer em vez de um erro solto. */
async function withPlatformColumn<T>(run: (platform: string) => Promise<T>) {
  try { return await run("u.is_platform_admin"); } catch (error) { if (!undefinedColumn(error)) throw error; return run("false"); }
}

export const loadSessionUser = (db: Queryable, tokenHash: string) => withPlatformColumn(async (platform) => {
  const result = await db.query<LoadedSessionUser>(`SELECT u.id,u.name,u.email,u.role,u.account_id AS "accountId",u.is_account_owner AS "isAccountOwner",${platform} AS "isPlatformAdmin",
    ${accessibleStoresJson} AS stores,
    COALESCE(array_agg(up.permission) FILTER (WHERE up.permission IS NOT NULL),'{}') permissions
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN accounts ac ON ac.id=u.account_id LEFT JOIN user_permissions up ON up.user_id=u.id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true AND (u.account_id IS NULL OR ac.active) GROUP BY u.id`, [tokenHash]);
  return result.rows[0] ?? null;
});

export type LoginUser = { id: string; role: "ADMIN" | "OPERATOR"; password_hash: string; totp_enabled: boolean; totp_secret_encrypted: string | null; is_platform_admin: boolean };

/** Quem pode tentar entrar com este e-mail: usuário ativo, de uma conta que não esteja suspensa. */
export const findLoginUser = (db: Queryable, email: string) => withPlatformColumn(async (platform) => {
  const result = await db.query<LoginUser>(`SELECT u.id,u.role,u.password_hash,u.totp_enabled,u.totp_secret_encrypted,${platform} AS is_platform_admin
    FROM users u LEFT JOIN accounts a ON a.id=u.account_id WHERE lower(u.email)=$1 AND u.active=true AND (u.account_id IS NULL OR a.active)`, [email]);
  return result.rows[0] ?? null;
});
