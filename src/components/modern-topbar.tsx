"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, LogOut, Search, ShoppingBag, X } from "lucide-react";
import { logoutAction } from "@/modules/auth/actions";
import type { SessionUser } from "@/modules/auth/session";
import type { Permission } from "@/modules/auth/permissions";
import { adminNavigationGroups } from "@/components/admin-navigation";

export function ModernTopbar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => {
    const allowed = (permission: Permission | null) => user.role === "ADMIN" || !permission || user.permissions.includes(permission);
    return adminNavigationGroups.map((group) => ({ ...group, links: group.links.filter(([, , , permission]) => allowed(permission)) })).filter((group) => group.links.length);
  }, [user.role, user.permissions]);
  const current = groups.flatMap((group) => group.links.map((link) => ({ group: group.label, link }))).filter(({ link }) => pathname === link[0] || pathname.startsWith(`${link[0]}/`)).sort((a, b) => b.link[0].length - a.link[0].length)[0];
  const results = groups.map((group) => ({ ...group, links: group.links.filter(([, label]) => label.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))) })).filter((group) => group.links.length);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => { queueMicrotask(() => open ? inputRef.current?.focus() : setQuery("")); }, [open]);

  return <>
    <header className="modern-topbar">
      <div className="modern-page-context"><small>Coliseu / {current?.group ?? "Gestão"}</small><h1>{current?.link[1] ?? "Área administrativa"}</h1></div>
      <div className="modern-topbar-actions">
        <span className="modern-system-status"><i/>Operação online</span>
        <button className="modern-command-trigger" type="button" onClick={() => setOpen(true)}><Search size={16}/><span>Ir para módulo</span><kbd>Ctrl K</kbd></button>
        <Link className="modern-pos-action" href="/pdv"><ShoppingBag size={16}/>Abrir PDV</Link>
        <div className="modern-topbar-user"><span className="admin-avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === "ADMIN" ? "Administrador" : "Operador"}</small></div></div>
        <form action={logoutAction} className="modern-logout"><button type="submit" title="Sair" aria-label="Sair"><LogOut size={17}/></button></form>
      </div>
    </header>
    {open && <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Navegação rápida" onMouseDown={(event) => event.stopPropagation()}>
        <header><Search size={19}/><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar vendas, estoque, notas fiscais..." aria-label="Buscar módulo"/><button type="button" onClick={() => setOpen(false)} aria-label="Fechar navegação rápida"><X size={18}/></button></header>
        <div className="command-results">{results.map((group) => <section key={group.id}><p>{group.label}</p>{group.links.map(([href, label, Icon]) => <Link key={href} href={href} onClick={() => setOpen(false)}><span><Icon size={17}/></span>{label}<Command size={13}/></Link>)}</section>)}{!results.length && <div className="command-empty">Nenhum módulo encontrado.</div>}</div>
        <footer><span>Digite para filtrar os módulos</span><span>Esc fecha a navegação</span></footer>
      </section>
    </div>}
  </>;
}
