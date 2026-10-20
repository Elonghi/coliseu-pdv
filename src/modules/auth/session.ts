import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { shouldUseSecureSessionCookie } from "@/lib/security";

import type { Permission } from "./permissions";

export type UserTheme = "LIGHT" | "DARK" | "SYSTEM";
export type SessionUser = { id: string; name: string; email: string; role: "ADMIN" | "OPERATOR"; theme: UserTheme; permissions: Permission[] };
const COOKIE_NAME = "coliseu_session";
const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const ttlHours = Math.max(1, Number(process.env.SESSION_TTL_HOURS ?? 12));
  const expires = new Date(Date.now() + ttlHours * 3_600_000);
  await pool.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(token), userId, expires]);
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: shouldUseSecureSessionCookie(), sameSite: "lax", path: "/", expires });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const result = await pool.query<SessionUser>(`SELECT u.id,u.name,u.email,u.role,u.theme,
    COALESCE(array_agg(up.permission) FILTER (WHERE up.permission IS NOT NULL),'{}') permissions
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN user_permissions up ON up.user_id=u.id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true GROUP BY u.id`, [hashToken(token)]);
  return result.rows[0] ?? null;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && !user.permissions.includes(permission)) throw new AppError("Você não tem permissão para acessar este recurso.", 403, "FORBIDDEN");
  return user;
}

export async function requireUser(role?: "ADMIN" | "OPERATOR") {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) throw new AppError("Você não tem permissão para esta ação.", 403, "FORBIDDEN");
  return user;
}

export async function requireApiUser(role?: "ADMIN" | "OPERATOR") {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Sessão expirada.", 401, "UNAUTHORIZED");
  if (role && user.role !== role) throw new AppError("Você não tem permissão para esta ação.", 403, "FORBIDDEN");
  return user;
}

export async function requireApiPermission(permission: Permission) {
  const user = await requireApiUser();
  if (user.role !== "ADMIN" && !user.permissions.includes(permission)) throw new AppError("Você não tem permissão para esta ação.", 403, "FORBIDDEN");
  return user;
}
