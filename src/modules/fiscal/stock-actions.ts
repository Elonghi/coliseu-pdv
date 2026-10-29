"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/modules/admin/actions";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { receiveFiscalInvoiceItems, type FiscalReceiptDecision } from "@/modules/fiscal/stock";

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = new Set<FiscalReceiptDecision["action"]>(["RECEIVED", "MISSING", "SKIPPED"]);

export async function fiscalReceiptAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission(permissions.STOCK_MANAGE);
    const invoiceId = String(form.get("invoiceId") ?? "");
    const decisions: FiscalReceiptDecision[] = [];
    for (const key of new Set(form.keys())) {
      if (!key.startsWith("action_")) continue;
      const itemId = key.slice("action_".length);
      const action = String(form.get(key)) as FiscalReceiptDecision["action"];
      if (!uuid.test(itemId) || !actions.has(action)) continue;
      const quantity = String(form.get(`quantity_${itemId}`) ?? "").trim();
      decisions.push({ itemId, action, quantity: quantity ? Number(quantity) : undefined });
    }
    const result = await receiveFiscalInvoiceItems(invoiceId, decisions, { id: user.id, name: user.name }, String(form.get("observation") ?? ""));
    revalidatePath(`/admin/fiscal/${invoiceId}`);
    revalidatePath("/admin/products");
    revalidatePath("/admin/stock");

    const parts = [
      result.entered ? `${result.entered} item(ns) lançado(s) no estoque` : null,
      result.missing ? `${result.missing} com falta registrada` : null,
      result.skipped ? `${result.skipped} fora do estoque` : null,
      result.alreadyEntered ? `${result.alreadyEntered} já estava(m) lançado(s)` : null,
    ].filter(Boolean);
    if (result.errors) return { error: `${parts.join(", ") || "Nenhum item lançado"}, mas ${result.errors} item(ns) precisam de revisão. Consulte a situação de cada item na tabela.` };
    return { ok: `${parts.join(" · ")}.` };
  } catch (error) { return { error: message(error) }; }
}
