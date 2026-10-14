import Link from "next/link";
import { BarChart3, Boxes, CreditCard, FileInput, FileText, LayoutDashboard, Package, ShoppingBag, Users, UserRound, WalletCards } from "lucide-react";
import { logoutAction } from "@/modules/auth/actions";
import type { SessionUser } from "@/modules/auth/session";

const groups = [
  { label: "Visão geral", links: [["/admin", "Dashboard", LayoutDashboard]] },
  { label: "Operação", links: [["/admin/sales", "Vendas", ShoppingBag], ["/admin/stock", "Estoque", BarChart3], ["/admin/finance", "Financeiro", WalletCards]] },
  { label: "Catálogo", links: [["/admin/products", "Produtos", Package], ["/admin/categories", "Categorias", Boxes], ["/admin/payment-methods", "Pagamentos", CreditCard]] },
  { label: "Relacionamento", links: [["/admin/players", "Jogadores", UserRound], ["/admin/users", "Usuários", Users]] },
  { label: "Fiscal", links: [["/admin/fiscal", "Notas fiscais", FileText], ["/admin/fiscal/integration", "Importação e SEFAZ", FileInput]] },
] as const;
export function AdminNav({ user }: { user: SessionUser }) {
  return <aside className="bg-[#172744] text-white p-5 flex flex-col gap-5 md:min-h-screen"><div><div className="text-emerald-400 text-xs font-black tracking-[.2em]">COLISEU</div><div className="text-xl font-black">Painel PDV</div></div><nav className="flex md:flex-col gap-5 overflow-x-auto">{groups.map(group=><section className="min-w-max" key={group.label}><p className="px-3 mb-1 text-[.68rem] font-black uppercase tracking-[.14em] text-slate-500">{group.label}</p><div className="grid gap-1">{group.links.map(([href,label,Icon])=><Link key={href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-200 hover:bg-white/10 whitespace-nowrap" href={href}><Icon size={17}/>{label}</Link>)}</div></section>)}</nav><div className="mt-auto border-t border-white/15 pt-4"><p className="font-bold text-sm">{user.name}</p><p className="text-xs text-slate-400 mb-3">Administrador</p><div className="flex gap-2"><Link href="/pdv" className="btn bg-emerald-500 text-white text-sm">Abrir PDV</Link><form action={logoutAction}><button className="btn bg-white/10 text-white text-sm">Sair</button></form></div></div></aside>;
}
