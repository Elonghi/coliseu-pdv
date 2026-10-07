"use client";
import { useActionState } from "react";
import { loginAction } from "@/modules/auth/actions";
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return <form action={action} className="grid gap-4">
    <label className="label">E-mail<input className="field" name="email" type="email" autoComplete="username" required autoFocus /></label>
    <label className="label">Senha<input className="field" name="password" type="password" autoComplete="current-password" required /></label>
    {state.error && <p className="notice-error">{state.error}</p>}
    <button className="btn btn-primary" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
  </form>;
}
