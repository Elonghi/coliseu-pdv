"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/modules/admin/actions";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission, requireUser } from "@/modules/auth/session";
import { createTerminal, enqueueSaleReceipt, enqueueTestPage, rotateTerminalToken, setTerminalActive, updateTerminal, type TerminalInput } from "./service";

export type TokenActionState = ActionState & { token?: string };

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const refresh = () => revalidatePath("/admin/printers");
const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const terminalInput = (form: FormData): TerminalInput => ({ name: text(form, "name"), columns: Number(text(form, "columns")), codePage: text(form, "codePage"), cut: form.get("cut") === "on" });

export async function createTerminalAction(_: TokenActionState, form: FormData): Promise<TokenActionState> {
  try { const user = await requireUser("ADMIN"); const { token } = await createTerminal(terminalInput(form), user.id); refresh(); return { ok: "Impressora cadastrada. Copie o token agora: ele não aparece de novo.", token }; }
  catch (error) { return { error: message(error) }; }
}

export async function updateTerminalAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await requireUser("ADMIN"); await updateTerminal(text(form, "id"), terminalInput(form), user.id); refresh(); return { ok: "Impressora atualizada." }; }
  catch (error) { return { error: message(error) }; }
}

export async function rotateTokenAction(_: TokenActionState, form: FormData): Promise<TokenActionState> {
  try { const user = await requireUser("ADMIN"); const token = await rotateTerminalToken(text(form, "id"), user.id); refresh(); return { ok: "Token novo gerado. O anterior deixou de funcionar.", token }; }
  catch (error) { return { error: message(error) }; }
}

export async function toggleTerminalAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await requireUser("ADMIN"); const active = form.get("active") === "true"; await setTerminalActive(text(form, "id"), active, user.id); refresh(); return { ok: active ? "Impressora reativada." : "Impressora desativada." }; }
  catch (error) { return { error: message(error) }; }
}

export async function testPrintAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await requirePermission(permissions.CASH_MANAGE); await enqueueTestPage(text(form, "id"), user.id); refresh(); return { ok: "Teste enviado para a fila. Acompanhe abaixo." }; }
  catch (error) { return { error: message(error) }; }
}

export async function reprintSaleAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await requirePermission(permissions.CASH_MANAGE); await enqueueSaleReceipt(Number(text(form, "saleId")), text(form, "terminalId"), user); refresh(); return { ok: "Comprovante enviado para a fila." }; }
  catch (error) { return { error: message(error) }; }
}
