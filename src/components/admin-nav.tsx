"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight, Banknote, BarChart3, Boxes, ChevronLeft, ChevronRight, ClipboardCheck,
  CreditCard, FileInput, FileText, History, LayoutDashboard, LogOut, Monitor, Moon, Package,
  PanelLeftClose, ShieldCheck, ShoppingBag, Store, Sun, Tags, Truck, UserRound, Users,
  WalletCards, X,
} from "lucide-react";
import { logoutAction } from "@/modules/auth/actions";
import { permissions, type Permission } from "@/modules/auth/permissions";
import type { SessionUser, UserTheme } from "@/modules/auth/session";
import { useTheme } from "@/components/theme-provider";

const groups = [
  { label: "Visão geral", links: [["/admin", "Dashboard", LayoutDashboard, permissions.DASHBOARD_VIEW]] },
  { label: "Operação", links: [["/admin/sales", "Vendas", ShoppingBag, permissions.SALES_VIEW], ["/admin/cash", "Caixas", Banknote, permissions.CASH_MANAGE], ["/admin/stock", "Estoque", BarChart3, permissions.STOCK_MANAGE], ["/admin/inventory", "Inventários", ClipboardCheck, permissions.INVENTORY_MANAGE], ["/admin/finance", "Financeiro", WalletCards, permissions.FINANCE_MANAGE], ["/admin/purchases", "Compras", Truck, permissions.PURCHASE_MANAGE]] },
  { label: "Catálogo", links: [["/admin/products", "Produtos", Package, permissions.CATALOG_MANAGE], ["/admin/labels", "Etiquetas", Tags, permissions.CATALOG_MANAGE], ["/admin/categories", "Categorias", Boxes, permissions.CATALOG_MANAGE], ["/admin/payment-methods", "Pagamentos", CreditCard, permissions.CATALOG_MANAGE]] },
  { label: "Relacionamento", links: [["/admin/players", "Jogadores", UserRound, permissions.PLAYERS_MANAGE], ["/admin/users", "Usuários", Users, permissions.USERS_MANAGE]] },
  { label: "Fiscal", links: [["/admin/fiscal", "Notas fiscais", FileText, permissions.FISCAL_MANAGE], ["/admin/fiscal/movements", "Entradas e saídas", ArrowLeftRight, permissions.FISCAL_MANAGE], ["/admin/fiscal/integration", "Importação e SEFAZ", FileInput, permissions.FISCAL_MANAGE]] },
  { label: "Segurança", links: [["/admin/audit", "Auditoria", History, permissions.AUDIT_VIEW], ["/security", "Minha segurança", ShieldCheck, null]] },
] as const;

const themeOptions: { value: UserTheme; label: string; icon: typeof Sun }[] = [
  { value: "LIGHT", label: "Claro", icon: Sun },
  { value: "DARK", label: "Escuro", icon: Moon },
  { value: "SYSTEM", label: "Sistema", icon: Monitor },
];

export function AdminNav({ user, collapsed, mobileOpen, onToggle, onClose }: {
  user: SessionUser;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { theme, setTheme, pending } = useTheme();
  const allowed = (permission: Permission | null) => user.role === "ADMIN" || !permission || user.permissions.includes(permission);
  const matchingHrefs: string[] = [];
  for (const group of groups) for (const [href, , , permission] of group.links) {
    if (allowed(permission) && (pathname === href || pathname.startsWith(`${href}/`))) matchingHrefs.push(href);
  }
  const activeHref = matchingHrefs.sort((a, b) => b.length - a.length)[0];
  const active = (href: string) => href === activeHref;

  return <aside className={`admin-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-open" : ""}`} aria-label="Navegação principal">
    <div className="admin-brand">
      <span className="admin-brand-mark"><Store size={20}/></span>
      <div className="admin-brand-copy"><span>COLISEU</span><strong>Gestão PDV</strong></div>
      <button className="admin-mobile-close" type="button" onClick={onClose} aria-label="Fechar menu"><X size={21}/></button>
    </div>

    <button className="admin-collapse-button" type="button" onClick={onToggle} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
      {collapsed ? <ChevronRight size={17}/> : <><PanelLeftClose size={17}/><span>Recolher menu</span><ChevronLeft size={15}/></>}
    </button>

    <nav className="admin-nav-scroll">
      {groups.map((group) => {
        const links = group.links.filter(([, , , permission]) => allowed(permission));
        return links.length ? <section className="admin-nav-group" key={group.label}>
          <p>{group.label}</p>
          <div>{links.map(([href, label, Icon]) => <Link
            key={href}
            className={`admin-nav-link ${active(href) ? "is-active" : ""}`}
            href={href}
            title={collapsed ? label : undefined}
            aria-current={active(href) ? "page" : undefined}
            onClick={onClose}
          ><Icon size={18}/><span>{label}</span></Link>)}</div>
        </section> : null;
      })}
    </nav>

    <div className="admin-sidebar-footer">
      <div className="theme-switcher" aria-label="Tema da interface">
        {themeOptions.map(({ value, label, icon: Icon }) => <button
          type="button" key={value} className={theme === value ? "is-active" : ""}
          disabled={pending} onClick={() => setTheme(value)} title={label}
          aria-label={`Tema ${label}`} aria-pressed={theme === value}
        ><Icon size={15}/><span>{label}</span></button>)}
      </div>
      <div className="admin-user">
        <span className="admin-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <div><strong>{user.name}</strong><small>{user.role === "ADMIN" ? "Administrador" : "Operador"}</small></div>
      </div>
      <div className="admin-quick-actions">
        <Link href="/pdv" className="admin-pdv-link" title="Abrir PDV"><ShoppingBag size={17}/><span>Abrir PDV</span></Link>
        <form action={logoutAction}><button type="submit" title="Sair"><LogOut size={17}/><span>Sair</span></button></form>
      </div>
    </div>
  </aside>;
}
