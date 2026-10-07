"use server";
import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { pool } from "@/db";
import { createSession, destroySession } from "./session";

export type LoginState = { error?: string };
export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const result = await pool.query<{ id: string; password_hash: string }>("SELECT id,password_hash FROM users WHERE lower(email)=$1 AND active=true", [email]);
  const user = result.rows[0];
  if (!user || !(await compare(password, user.password_hash))) return { error: "E-mail ou senha inválidos." };
  await pool.query("DELETE FROM sessions WHERE expires_at<=now()");
  await createSession(user.id);
  redirect("/");
}
export async function logoutAction() { await destroySession(); redirect("/login"); }
