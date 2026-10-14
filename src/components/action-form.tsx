"use client";
import { useActionState } from "react";
import type { ActionState } from "@/modules/admin/actions";

export function ActionForm({ action, children, className, submitLabel = "Salvar" }: { action: (state: ActionState, data: FormData) => Promise<ActionState>; children: React.ReactNode; className?: string; submitLabel?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className={className}>{children}{state.error && <p className="notice-error">{state.error}</p>}{state.ok && <p className="notice-ok">{state.ok}</p>}<button className="btn btn-primary" disabled={pending}>{pending ? "Processando..." : submitLabel}</button></form>;
}
