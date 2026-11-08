import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "@/db";
import { rawPool } from "@/db/raw";
import { AppError } from "@/lib/errors";
import { shouldUseSecureSessionCookie } from "@/lib/security";

import type { Permission } from "./permissions";
import { hashSessionToken, SESSION_COOKIE } from "./request-scope";
import { loadSessionUser } from "./session-user";
import { resolveActiveStore, STORE_COOKIE, type StoreSummary } from "./stores";

export type SessionUser = { id: string; name: string; email: string; role: "ADMIN" | "OPERATOR"; permissions: Permission[]; accountId: string | null; isAccountOwner: boolean; isPlatformAdmin: boolean; stores: StoreSummary[]; activeStoreId: string | null; consolidated: boolean };
const COOKIE_NAME = SESSION_COOKIE;
const hashToken = hashSessionToken;

export async function createSession(userId: string, remember = false) {
  const token = randomBytes(32).toString("base64url");
  const regularHours = Math.min(168, Math.max(1, Number(process.env.SESSION_TTL_HOURS ?? 12) || 12));
  const rememberedDays = Math.min(365, Math.max(1, Number(process.env.REMEMBER_SESSION_TTL_DAYS ?? 30) || 30));
  const expires = new Date(Date.now() + (remember ? rememberedDays * 86_400_000 : regularHours * 3_600_000));
  await rawPool.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(token), userId, expires]);
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: shouldUseSecureSessionCookie(), sameSite: "lax", path: "/", priority: "high", ...(remember ? { expires } : {}) });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await rawPool.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await loadSessionUser(pool, hashToken(token));
  if (!user) return null;
  const active = resolveActiveStore(user.stores, store.get(STORE_COOKIE)?.value);
  return { ...user, activeStoreId: active.storeId, consolidated: active.consolidated };
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

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) throw new AppError("Esta área é só do administrador do sistema.", 403, "FORBIDDEN");
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
