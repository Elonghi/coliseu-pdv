"use client";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import type { ActionState } from "@/modules/admin/actions";

/* Botão que abre um modal pedindo o motivo antes de executar uma ação que fica na auditoria (cancelar pedido, item ou comanda). */
export function ReasonModal({ trigger, triggerClassName = "btn btn-ghost btn-sm", title, description, action, fields, submitLabel }: {
  trigger: React.ReactNode; triggerClassName?: string; title: string; description?: string;
  action: (state: ActionState, data: FormData) => Promise<ActionState>; fields: Record<string, string>; submitLabel: string;
}) {
  return <Modal trigger={trigger} triggerClassName={triggerClassName} size="sm" title={title} description={description}>
    <ActionForm action={action} submitLabel={submitLabel} submitVariant="danger-solid" className="grid gap-4">
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>)}
      <label className="label">Motivo<input className="field" name="reason" minLength={3} maxLength={200} placeholder="Ex.: pedido duplicado, cliente desistiu" required autoFocus/></label>
      <p className="field-hint">O motivo fica registrado na auditoria da comanda.</p>
    </ActionForm>
  </Modal>;
}
