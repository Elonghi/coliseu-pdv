"use client";

import { useEffect, useState } from "react";
import { Menu, Store } from "lucide-react";
import type { SessionUser } from "@/modules/auth/session";
import { AdminNav } from "@/components/admin-nav";

const STORAGE_KEY = "coliseu:admin-menu-collapsed";

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { queueMicrotask(() => setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "true")); }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const toggle = () => setCollapsed((current) => {
    const next = !current;
    window.localStorage.setItem(STORAGE_KEY, String(next));
    return next;
  });

  return <div className={`admin-shell ${collapsed ? "menu-collapsed" : ""}`}>
    <header className="admin-mobile-header">
      <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={22}/></button>
      <div><Store size={18}/><strong>Coliseu Gestão</strong></div>
      <span className="admin-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
    </header>
    {mobileOpen && <button className="admin-menu-backdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"/>}
    <AdminNav user={user} collapsed={collapsed} mobileOpen={mobileOpen} onToggle={toggle} onClose={() => setMobileOpen(false)}/>
    <main className="admin-content">{children}</main>
  </div>;
}
