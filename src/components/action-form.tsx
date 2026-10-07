"use client";
import { useActionState } from "react";
import type { ActionState } from "@/modules/admin/actions";

export function ActionForm({ action, children, className }: { action: (state: ActionState, data: FormData) => Promise<ActionState>; children: React.ReactNode; className?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className={className}>{children}{state.error && <p className="notice-error">{state.error}</p>}{state.ok && <p className="notice-ok">{state.ok}</p>}<button className="btn btn-primary" disabled={pending}>{pending ? "Salvando..." : "Salvar"}</button></form>;
}
