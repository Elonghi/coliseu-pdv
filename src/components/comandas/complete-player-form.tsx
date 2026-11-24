"use client";
import { ActionForm } from "@/components/action-form";
import { completePlayerAction } from "@/modules/comandas/actions";

/* Completa o cadastro de um jogador criado às pressas ao abrir a comanda. */
export function CompletePlayerForm({ playerId, sessionId, name, phone, email }: { playerId: string; sessionId?: string; name: string; phone?: string | null; email?: string | null }) {
  return <ActionForm action={completePlayerAction} submitLabel="Salvar cadastro completo" className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="playerId" value={playerId}/>
    <input type="hidden" name="sessionId" value={sessionId ?? ""}/>
    <label className="label sm:col-span-2">Nome completo<input className="field" name="name" defaultValue={name} minLength={2} maxLength={160} required/></label>
    <label className="label">Telefone<input className="field" name="phone" defaultValue={phone ?? ""} inputMode="tel" maxLength={40}/></label>
    <label className="label">E-mail<input className="field" name="email" type="email" defaultValue={email ?? ""} maxLength={255}/></label>
    <label className="label sm:col-span-2">Observações<input className="field" name="notes" maxLength={1000} placeholder="Opcional"/></label>
  </ActionForm>;
}
