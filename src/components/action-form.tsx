"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/modules/admin/actions";
import { useModalClose } from "@/components/modal";
import { useToast } from "@/components/toast";

type Variant = "primary" | "success" | "danger" | "danger-solid" | "ghost";

/** O React limpa o formulário ao fim da ação; em caso de erro devolvemos o que a pessoa digitou. */
function restoreFields(form: HTMLFormElement, data: FormData) {
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name) continue;
    if (element instanceof HTMLInputElement && ["file", "password", "hidden", "submit", "button"].includes(element.type)) continue;
    const values = data.getAll(element.name).filter((value): value is string => typeof value === "string");
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) element.checked = values.includes(element.value);
    else if (element instanceof HTMLSelectElement && element.multiple) for (const option of Array.from(element.options)) option.selected = values.includes(option.value);
    else if (values.length) element.value = values[0];
  }
}

export function ActionForm({ action, children, className, submitLabel = "Salvar", submitVariant = "primary", inline, stickyActions, cancelHref }: {
  action: (state: ActionState, data: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  submitLabel?: string;
  submitVariant?: Variant;
  inline?: boolean;
  stickyActions?: boolean;
  cancelHref?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);
  const toast = useToast();
  const closeModal = useModalClose();
  const [state, formAction, pending] = useActionState(async (previous: ActionState, data: FormData) => {
    submitted.current = data;
    const result = await action(previous, data);
    // A página pode ser revalidada e este formulário sumir; por isso o aviso sai daqui, não de um efeito.
    if (result.ok) { toast?.(result.ok); closeModal?.(); }
    return result;
  }, {});

  useEffect(() => {
    if (state.error && submitted.current && form.current) restoreFields(form.current, submitted.current);
  }, [state]);

  return <form ref={form} action={formAction} className={`${className ?? ""} ${inline ? "form-inline" : ""}`}>
    {children}
    {state.error && <p className="form-notice notice-error" role="alert">{state.error}</p>}
    {state.ok && !toast && <p className="form-notice notice-ok" role="status">{state.ok}</p>}
    <div className={`form-actions ${stickyActions ? "form-actions-sticky" : ""}`}>
      {cancelHref && <Link className="btn btn-ghost" href={cancelHref}>Cancelar</Link>}
      <button className={`btn btn-${submitVariant}`} disabled={pending} aria-busy={pending}>{pending ? "Processando..." : submitLabel}</button>
    </div>
  </form>;
}
