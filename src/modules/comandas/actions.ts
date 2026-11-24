"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/modules/admin/actions";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission, requireUser } from "@/modules/auth/session";
import {
  addCounterOrder, cancelComandaSession, cancelOrder, cancelOrderItem, completeProvisionalPlayer, createComandas, markOrderDelivered,
  openComandaSession, rotateComandaQr, saveComandaMenu, saveComandaSettings, updateComanda,
} from "./service";

/* Ações das telas de comandas. Operar (abrir, lançar, entregar, cancelar) vale para quem opera o caixa; cadastrar comandas,
 * QR Codes, cardápio e configurações é do administrador. */

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const refresh = () => revalidatePath("/admin/comandas", "layout");
const operator = () => requirePermission(permissions.CASH_MANAGE);
const manager = () => requireUser("ADMIN");
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const decimal = (form: FormData, name: string) => { const value = text(form, name).replace(",", "."); return value === "" ? null : Number(value); };

export async function createComandasAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await manager();
    const from = Number(text(form, "from"));
    const result = await createComandas({ from, to: text(form, "to") === "" ? from : Number(text(form, "to")) }, user.id);
    refresh();
    return { ok: `${result.created} comanda(s) cadastrada(s)${result.skipped ? ` (${result.skipped} já existia(m))` : ""}.` };
  } catch (error) { return { error: message(error) }; }
}

export async function updateComandaAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await manager(); await updateComanda(text(form, "id"), { number: Number(text(form, "number")), active: form.get("active") === "on" }, user.id); refresh(); return { ok: "Comanda atualizada." }; }
  catch (error) { return { error: message(error) }; }
}

export async function rotateQrAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await manager(); const number = await rotateComandaQr(text(form, "id"), user.id); refresh(); return { ok: `QR da comanda ${number} trocado. O QR antigo parou de funcionar: imprima o novo.` }; }
  catch (error) { return { error: message(error) }; }
}

export async function saveSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await manager();
    await saveComandaSettings({
      enabled: form.get("enabled") === "on", requireLocation: form.get("requireLocation") === "on",
      latitude: decimal(form, "latitude"), longitude: decimal(form, "longitude"), radiusMeters: Number(text(form, "radiusMeters") || 150),
    }, user.id);
    refresh();
    return { ok: "Configurações salvas." };
  } catch (error) { return { error: message(error) }; }
}

export async function saveMenuAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await manager();
    const result = await saveComandaMenu(form.getAll("productId").map(String), user.id);
    refresh();
    return { ok: `Cardápio salvo: ${result.onMenu} produto(s) disponível(is) para pedir pelo celular.` };
  } catch (error) { return { error: message(error) }; }
}

export async function openSessionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const comandaId = text(form, "comandaId");
  try {
    const user = await operator();
    const provisional = text(form, "mode") === "provisional";
    await openComandaSession(provisional
      ? { comandaId, provisionalName: text(form, "name"), provisionalPhone: text(form, "phone") }
      : { comandaId, playerId: text(form, "playerId") || undefined }, user.id);
    refresh();
  } catch (error) { return { error: message(error) }; }
  redirect(`/admin/comandas/${comandaId}`);
}

export async function addCounterOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await operator();
    await addCounterOrder(text(form, "sessionId"), [{ productId: text(form, "productId"), quantity: Number(text(form, "quantity") || 1) }], user.id, text(form, "note"));
    refresh();
    return { ok: "Item lançado na comanda." };
  } catch (error) { return { error: message(error) }; }
}

export async function deliverOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await operator(); await markOrderDelivered(text(form, "orderId"), user.id); refresh(); return { ok: "Pedido marcado como entregue." }; }
  catch (error) { return { error: message(error) }; }
}

export async function cancelOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await operator(); await cancelOrder(text(form, "orderId"), text(form, "reason"), user.id); refresh(); return { ok: "Pedido cancelado." }; }
  catch (error) { return { error: message(error) }; }
}

export async function cancelItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await operator(); await cancelOrderItem(text(form, "itemId"), text(form, "reason"), user.id); refresh(); return { ok: "Item cancelado." }; }
  catch (error) { return { error: message(error) }; }
}

export async function cancelSessionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await operator(); await cancelComandaSession(text(form, "sessionId"), text(form, "reason"), user.id); refresh(); }
  catch (error) { return { error: message(error) }; }
  redirect("/admin/comandas");
}

export async function completePlayerAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await operator();
    await completeProvisionalPlayer(text(form, "playerId"), { name: text(form, "name"), phone: text(form, "phone"), email: text(form, "email"), notes: text(form, "notes") }, user.id, text(form, "sessionId") || undefined);
    refresh();
    revalidatePath("/admin/players");
    return { ok: "Cadastro completo." };
  } catch (error) { return { error: message(error) }; }
}
