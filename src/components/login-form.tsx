"use client";

import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { loginAction } from "@/modules/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);

  return <form action={action} className="login-form">
    <label className="login-field-label">E-mail corporativo<span className="login-field-wrap"><Mail size={18}/><input name="email" type="email" autoComplete="username" placeholder="voce@empresa.com.br" aria-invalid={Boolean(state.error)} required autoFocus/></span></label>
    <label className="login-field-label">Senha<span className="login-field-wrap"><LockKeyhole size={18}/><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" aria-invalid={Boolean(state.error)} required/><button type="button" className="login-password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
    <label className="login-field-label">Código 2FA <small>se estiver ativado</small><span className="login-field-wrap"><ShieldCheck size={18}/><input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="000000"/></span></label>
    <label className="login-remember"><input type="checkbox" name="remember" value="true"/><span><b>Manter conectado neste dispositivo</b><small>O acesso continuará ativo por até 30 dias.</small></span></label>
    {state.error && <p className="notice-error" role="alert">{state.error}</p>}
    <button className="btn btn-primary login-submit" disabled={pending}>{pending ? "Validando acesso..." : "Entrar no sistema"}</button>
  </form>;
}
