"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, PanelLeftClose, ShoppingBag, Store, X } from "lucide-react";
import { logoutAction } from "@/modules/auth/actions";
import type { Permission } from "@/modules/auth/permissions";
import type { SessionUser } from "@/modules/auth/session";
import { adminNavigationGroups as groups } from "@/components/admin-navigation";
import { InstallAppButton } from "@/components/pwa";

export function AdminNav({ user, collapsed, mobileOpen, onToggle, onClose }: {
  user: SessionUser;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const groupStorageKey = `coliseu:admin-menu-groups:${user.id}`;
  const allowed = (permission: Permission | null) => user.role === "ADMIN" || !permission || user.permissions.includes(permission);
  const matchingHrefs: string[] = [];
  for (const group of groups) for (const [href, , , permission] of group.links) {
    if (allowed(permission) && (pathname === href || pathname.startsWith(`${href}/`))) matchingHrefs.push(href);
  }
  const activeHref = matchingHrefs.sort((a, b) => b.length - a.length)[0];
  const active = (href: string) => href === activeHref;

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = window.localStorage.getItem(groupStorageKey);
        if (stored) setCollapsedGroups(JSON.parse(stored));
      } catch { /* Preferências inválidas voltam ao padrão aberto. */ }
    });
  }, [groupStorageKey]);

  const toggleGroup = (id: string) => setCollapsedGroups((current) => {
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    window.localStorage.setItem(groupStorageKey, JSON.stringify(next));
    return next;
  });

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
        const containsActive = links.some(([href]) => active(href));
        const groupCollapsed = collapsedGroups.includes(group.id) && !containsActive;
        return links.length ? <section className={`admin-nav-group ${groupCollapsed ? "is-group-collapsed" : ""}`} key={group.id}>
          <button className="admin-nav-group-toggle" type="button" onClick={() => toggleGroup(group.id)} aria-expanded={!groupCollapsed} aria-controls={`admin-group-${group.id}`} title={`${groupCollapsed ? "Expandir" : "Recolher"} ${group.label}`}>
            <span>{group.label}</span><ChevronDown size={14}/>
          </button>
          <div id={`admin-group-${group.id}`} hidden={groupCollapsed}>{links.map(([href, label, Icon]) => <Link
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
      <div className="admin-user">
        <span className="admin-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <div><strong>{user.name}</strong><small>{user.role === "ADMIN" ? "Administrador" : "Operador"}</small></div>
      </div>
      <InstallAppButton className="admin-install"/>
      <div className="admin-quick-actions">
        <Link href="/pdv" className="admin-pdv-link" title="Abrir PDV"><ShoppingBag size={17}/><span>Abrir PDV</span></Link>
        <form action={logoutAction}><button type="submit" title="Sair"><LogOut size={17}/><span>Sair</span></button></form>
      </div>
    </div>
  </aside>;
}
