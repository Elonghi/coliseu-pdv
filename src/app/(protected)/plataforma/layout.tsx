import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Server } from "lucide-react";
import { ToastProvider } from "@/components/toast";
import { appVersion } from "@/lib/version";
import { logoutAction } from "@/modules/auth/actions";
import { getCurrentUser } from "@/modules/auth/session";

export const dynamic = "force-dynamic";

/* Área do administrador do sistema, separada do painel dos lojistas. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isPlatformAdmin) redirect(user.role === "ADMIN" ? "/admin" : "/pdv");
  return <ToastProvider>
    <div className="platform-shell">
      <header className="platform-header">
        <Link href="/plataforma" className="platform-brand"><Server size={18}/><span>COLISEON</span><strong>Painel do sistema</strong></Link>
        <nav aria-label="Navegação do painel do sistema">
          <Link href="/plataforma">Lojistas</Link>
          {user.accountId && <Link href="/admin">Minha loja</Link>}
        </nav>
        <form action={logoutAction}><button type="submit" title="Sair"><LogOut size={16}/><span>{user.name.split(" ")[0]} · Sair</span></button></form>
      </header>
      <main className="admin-content">
        {children}
        <footer className="admin-footer"><span>Coliseon · Painel do sistema</span><span title="Versão do sistema">Versão {appVersion}</span></footer>
      </main>
    </div>
  </ToastProvider>;
}
