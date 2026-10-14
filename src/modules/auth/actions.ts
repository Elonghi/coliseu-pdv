"use server";
import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { pool } from "@/db";
import { createSession, destroySession } from "./session";
import { decryptTotpSecret, verifyTotp } from "./totp";

export type LoginState = { error?: string };
export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const otp = String(formData.get("otp") ?? "").trim();
  const result = await pool.query<{ id: string; password_hash: string;totp_enabled:boolean;totp_secret_encrypted:string|null }>("SELECT id,password_hash,totp_enabled,totp_secret_encrypted FROM users WHERE lower(email)=$1 AND active=true", [email]);
  const user = result.rows[0];
  if (!user || !(await compare(password, user.password_hash))) return { error: "E-mail ou senha inválidos." };
  if(user.totp_enabled&&(!user.totp_secret_encrypted||!verifyTotp(decryptTotpSecret(user.totp_secret_encrypted),otp)))return{error:"Código de autenticação em duas etapas inválido."};
  await pool.query("DELETE FROM sessions WHERE expires_at<=now()");
  await createSession(user.id);
  redirect("/");
}
export async function logoutAction() { await destroySession(); redirect("/login"); }
