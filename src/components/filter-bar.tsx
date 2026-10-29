"use client";
import Link from "next/link";
import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

const TYPING_DELAY = 450;
const DATE_DELAY = 700;

/** Formulário GET que aplica os filtros sozinho: listas na hora, texto e datas após uma pausa. */
export function FilterBar({ children, clearHref, hasFilters, className = "" }: {
  children: React.ReactNode;
  clearHref: string;
  hasFilters: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const apply = (form: HTMLFormElement) => {
    const params = new URLSearchParams(current.toString());
    const names = new Set(Array.from(form.elements).map((element) => (element as HTMLInputElement).name).filter(Boolean));
    for (const name of names) params.delete(name);
    for (const [name, value] of new FormData(form)) if (typeof value === "string" && value.trim()) params.append(name, value.trim());
    params.delete("page");
    const text = params.toString();
    startTransition(() => router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false }));
  };

  const schedule = (form: HTMLFormElement, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(form), delay);
  };

  return <form
    method="get"
    className={`toolbar ${className}`}
    data-pending={pending}
    onSubmit={(event) => { event.preventDefault(); clearTimeout(timer.current); apply(event.currentTarget); }}
    onChange={(event) => {
      const form = event.currentTarget;
      const target = event.target as unknown as HTMLInputElement | HTMLSelectElement;
      if (target instanceof HTMLSelectElement || target.type === "checkbox" || target.type === "radio") return apply(form);
      if (target.type === "date") return /^(19|20)\d{2}-/.test(target.value) || !target.value ? schedule(form, DATE_DELAY) : undefined;
      schedule(form, TYPING_DELAY);
    }}
  >
    {children}
    {hasFilters && <div className="toolbar-end"><Link className="btn btn-ghost btn-sm" href={clearHref}><X size={14}/>Limpar filtros</Link></div>}
  </form>;
}

export function SearchField({ name = "q", defaultValue, placeholder, label, className = "toolbar-grow" }: {
  name?: string;
  defaultValue?: string;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return <label className={`toolbar-field ${className}`}>
    {label ?? "Buscar"}
    <span className="search-box"><Search size={16}/><input className="field" type="search" name={name} defaultValue={defaultValue} placeholder={placeholder} autoComplete="off"/></span>
  </label>;
}

/** Filtros menos usados ficam recolhidos e abrem sozinhos quando algum está ativo. */
export function MoreFilters({ active, label = "Mais filtros", children }: { active: boolean; label?: string; children: React.ReactNode }) {
  return <details className="toolbar-more" open={active || undefined}>
    <summary><SlidersHorizontal size={15}/>{label}</summary>
    <div className="toolbar-more-grid">{children}</div>
  </details>;
}
