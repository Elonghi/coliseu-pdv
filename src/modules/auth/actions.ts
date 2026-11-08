"use server";
import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { rawPool } from "@/db/raw";
import { createSession, destroySession } from "./session";
import { decryptTotpSecret, verifyTotp } from "./totp";

export type LoginState = { error?: string };
export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const otp = String(formData.get("otp") ?? "").trim();
  const remember = formData.get("remember") === "true";
  // Identidade vem antes do escopo: o login usa a conexão sem lojista nem loja. Conta suspensa não entra.
  const result = await rawPool.query<{ id: string; role: "ADMIN" | "OPERATOR"; password_hash: string;totp_enabled:boolean;totp_secret_encrypted:string|null; is_platform_admin: boolean }>("SELECT u.id,u.role,u.password_hash,u.totp_enabled,u.totp_secret_encrypted,u.is_platform_admin FROM users u LEFT JOIN accounts a ON a.id=u.account_id WHERE lower(u.email)=$1 AND u.active=true AND (u.account_id IS NULL OR a.active)", [email]);
  const user = result.rows[0];
  if (!user || !(await compare(password, user.password_hash))) return { error: "E-mail ou senha inválidos." };
  if(user.totp_enabled&&(!user.totp_secret_encrypted||!verifyTotp(decryptTotpSecret(user.totp_secret_encrypted),otp)))return{error:"Código de autenticação em duas etapas inválido."};
  await rawPool.query("DELETE FROM sessions WHERE expires_at<=now()");
  await createSession(user.id, remember);
  redirect(user.is_platform_admin ? "/plataforma" : user.role === "ADMIN" ? "/admin" : "/pdv");
}
export async function logoutAction() { await destroySession(); redirect("/login"); }
