import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeDollarSign, Boxes, ReceiptText, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Entrar", description: "Acesse o painel de gestão e o PDV." };

const resources = [
  { icon: Boxes, title: "Estoque integrado", text: "Produtos, compras e entradas fiscais no mesmo fluxo." },
  { icon: BadgeDollarSign, title: "Financeiro organizado", text: "Duplicatas, recebimentos e conciliação em um só lugar." },
  { icon: ReceiptText, title: "Gestão fiscal", text: "NF-e, SEFAZ e documentos preservados com segurança." },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/pdv");

  return <main className="login-page">
    <section className="login-presentation">
      <Link href="/" className="login-brand"><span>C</span><div><small>COLISEU</small><b>PDV &amp; Gestão</b></div></Link>
      <div className="login-presentation-copy"><p className="login-eyebrow">OPERAÇÃO CENTRALIZADA</p><h1>Controle a loja inteira com clareza.</h1><p>Do recebimento da mercadoria ao fechamento da venda, suas informações permanecem conectadas e acessíveis.</p><div className="login-resource-list">{resources.map(({ icon: Icon, title, text }) => <article key={title}><span><Icon size={20}/></span><div><b>{title}</b><p>{text}</p></div></article>)}</div></div>
      <p className="login-security"><ShieldCheck size={17}/> Sessões protegidas, auditoria e controle de permissões.</p>
    </section>
    <section className="login-access">
      <div className="login-card">
        <Link href="/" className="login-back"><ArrowLeft size={16}/> Voltar para o site</Link>
        <div className="login-mobile-brand"><span>C</span><b>Coliseu PDV</b></div>
        <header><p className="login-eyebrow">ÁREA RESTRITA</p><h2>Bem-vindo de volta</h2><p>Informe suas credenciais para acessar o sistema.</p></header>
        <LoginForm/>
        <footer>Em caso de bloqueio, solicite a redefinição ao administrador da loja.</footer>
      </div>
    </section>
  </main>;
}
