import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/modules/auth/session";
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <main className="min-h-screen grid place-items-center p-5" style={{ background: "linear-gradient(135deg,#111c33,#263d6b)" }}><section className="card w-full max-w-md p-8"><div className="mb-7"><div className="text-xs font-black tracking-[.22em] text-emerald-600">COLISEU</div><h1 className="text-3xl font-black mt-1">Acesse o PDV</h1><p className="text-gray-500 mt-2">Gestão e frente de caixa em um só lugar.</p></div><LoginForm /></section></main>;
}
