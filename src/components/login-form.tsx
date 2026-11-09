"use client";

import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/modules/auth/actions";

export function LoginForm() {
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // O código do 2FA é um segundo passo: só aparece quando a senha foi aceita e o usuário tem 2FA ativo.
  const [state, action, pending] = useActionState(async (previous: LoginState, formData: FormData) => {
    const result = await loginAction(previous, formData);
    // Com login concluído a ação redireciona e não devolve estado: a tela não deve piscar de volta para a senha.
    if (result) setStep(result.needsOtp ? "otp" : "credentials");
    return result ?? previous;
  }, {});
  // Erro de código não aparece na tela de senha (depois do "Voltar"), e erro de senha não aparece na do código.
  const error = Boolean(state.needsOtp) === (step === "otp") ? state.error : undefined;

  if (step === "otp") return <form action={action} className="login-form">
    <input type="hidden" name="step" value="otp"/>
    <input type="hidden" name="email" value={email}/>
    <input type="hidden" name="password" value={password}/>
    {remember && <input type="hidden" name="remember" value="true"/>}
    <div className="login-otp-intro"><ShieldCheck size={20}/><div><b>Verificação em duas etapas</b><p>Digite o código de 6 dígitos do seu aplicativo autenticador para entrar como <b>{email}</b>.</p></div></div>
    <label className="login-field-label">Código de verificação<span className="login-field-wrap"><ShieldCheck size={18}/><input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="000000" aria-invalid={Boolean(error)} required autoFocus/></span></label>
    {error && <p className="notice-error" role="alert">{error}</p>}
    <button className="btn btn-primary login-submit" disabled={pending}>{pending ? "Validando código..." : "Entrar no sistema"}</button>
    <button type="button" className="btn btn-ghost login-step-back" onClick={() => { setStep("credentials"); setPassword(""); }}><ArrowLeft size={16}/>Voltar</button>
  </form>;

  return <form action={action} className="login-form">
    <label className="login-field-label">E-mail corporativo<span className="login-field-wrap"><Mail size={18}/><input name="email" type="email" autoComplete="username" placeholder="voce@empresa.com.br" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} required autoFocus/></span></label>
    <label className="login-field-label">Senha<span className="login-field-wrap"><LockKeyhole size={18}/><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} required/><button type="button" className="login-password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
    <label className="login-remember"><input type="checkbox" name="remember" value="true" checked={remember} onChange={(event) => setRemember(event.target.checked)}/><span><b>Manter conectado neste dispositivo</b><small>O acesso continuará ativo por até 30 dias.</small></span></label>
    {error && <p className="notice-error" role="alert">{error}</p>}
    <button className="btn btn-primary login-submit" disabled={pending}>{pending ? "Validando acesso..." : "Entrar no sistema"}</button>
  </form>;
}
