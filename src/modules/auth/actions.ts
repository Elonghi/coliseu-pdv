"use server";
import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { rawPool } from "@/db/raw";
import { createSession, destroySession } from "./session";
import { findLoginUser } from "./session-user";
import { decryptTotpSecret, verifyTotp } from "./totp";

export type LoginState = { error?: string };
export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const otp = String(formData.get("otp") ?? "").trim();
  const remember = formData.get("remember") === "true";
  // Identidade vem antes do escopo: o login usa a conexão sem lojista nem loja. Conta suspensa não entra.
  const user = await findLoginUser(rawPool, email);
  if (!user || !(await compare(password, user.password_hash))) return { error: "E-mail ou senha inválidos." };
  if(user.totp_enabled&&(!user.totp_secret_encrypted||!verifyTotp(decryptTotpSecret(user.totp_secret_encrypted),otp)))return{error:"Código de autenticação em duas etapas inválido."};
  await rawPool.query("DELETE FROM sessions WHERE expires_at<=now()");
  await createSession(user.id, remember);
  redirect(user.is_platform_admin ? "/plataforma" : user.role === "ADMIN" ? "/admin" : "/pdv");
}
export async function logoutAction() { await destroySession(); redirect("/login"); }
