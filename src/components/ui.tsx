import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Inbox, type LucideIcon } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import { queryHref, type SearchQuery } from "@/lib/query-string";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

export function PageHeader({ eyebrow, title, description, back, actions }: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return <header className="page-header">
    <div>
      {back && <Link className="back-link" href={back.href}><ArrowLeft size={15}/>{back.label}</Link>}
      {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-desc">{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}

export function StatCard({ label, value, hint, hintTone, icon: Icon, tone, href, primary }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  hintTone?: "danger" | "ok";
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  primary?: boolean;
}) {
  const className = `card stat ${tone ? `stat-${tone}` : ""} ${primary ? "stat-primary" : ""}`;
  const content = <>
    {Icon && <span className="stat-icon"><Icon size={19}/></span>}
    <span className="stat-body">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className={`stat-hint ${hintTone ? `is-${hintTone}` : ""}`}>{hint}</span>}
    </span>
  </>;
  return href ? <Link className={className} href={href}>{content}</Link> : <article className={className}>{content}</article>;
}

export function DateTimeCell({ value }: { value: Date | string | null | undefined }) {
  return value ? <span className="cell-main"><b>{formatDate(value)}</b><small>{formatTime(value)}</small></span> : <>—</>;
}

export function Badge({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return <span className={`badge badge-${tone} ${dot ? "badge-dot" : ""}`}>{children}</span>;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return <div className="empty">
    <span className="empty-icon"><Icon size={22}/></span>
    <strong>{title}</strong>
    {description && <p>{description}</p>}
    {action}
  </div>;
}

export type TabItem = { href: string; label: string; active: boolean; count?: number; warn?: boolean };

export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return <nav className="tabs" aria-label={label}>
    {items.map((item) => <Link key={item.href} className={`tab ${item.active ? "is-active" : ""}`} href={item.href} aria-current={item.active ? "page" : undefined}>
      {item.label}{item.count !== undefined && <span className={`tab-count ${item.warn ? "is-warn" : ""}`}>{item.count}</span>}
    </Link>)}
  </nav>;
}

export type ChipItem = { label: string; href: string; active: boolean; count?: number; tone?: "warn" | "danger" };

export function Chips({ label, items }: { label?: string; items: ChipItem[] }) {
  return <div className="chip-group" role="group" aria-label={label}>
    {label && <span className="chip-label">{label}</span>}
    {items.map((item) => <Link key={item.label} className={`chip ${item.active ? "is-active" : ""} ${item.tone ? `chip-${item.tone}` : ""}`} href={item.href} aria-current={item.active ? "true" : undefined}>
      {item.label}{item.count !== undefined && <span className="chip-count">{item.count}</span>}
    </Link>)}
  </div>;
}

export function Pagination({ pathname, query, page, perPage, total }: { pathname: string; query: SearchQuery; page: number; perPage: number; total: number }) {
  if (total <= perPage) return null;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const previous = page > 1 ? queryHref(pathname, query, { page: String(page - 1) }) : null;
  const next = page < pages ? queryHref(pathname, query, { page: String(page + 1) }) : null;
  return <nav className="pagination" aria-label="Paginação">
    <span>Mostrando <b>{from}–{to}</b> de <b>{total}</b></span>
    <div className="pagination-buttons">
      {previous ? <Link className="btn btn-ghost btn-sm" href={previous}><ChevronLeft size={15}/>Anterior</Link> : <span className="btn btn-ghost btn-sm" aria-disabled="true"><ChevronLeft size={15}/>Anterior</span>}
      <span>Página {page} de {pages}</span>
      {next ? <Link className="btn btn-ghost btn-sm" href={next}>Próxima<ChevronRight size={15}/></Link> : <span className="btn btn-ghost btn-sm" aria-disabled="true">Próxima<ChevronRight size={15}/></span>}
    </div>
  </nav>;
}
