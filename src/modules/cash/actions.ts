"use server";
import { revalidatePath } from "next/cache";
import { parseMoney } from "@/lib/money";
import { requirePermission, requireUser } from "@/modules/auth/session";
import { permissions } from "@/modules/auth/permissions";
import type { ActionState } from "@/modules/admin/actions";
import { addCashMovement, closeCashSession, createCashRegister, openCashSession } from "./service";

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const refresh = () => { revalidatePath("/admin/cash"); revalidatePath("/admin"); };

export async function cashRegisterAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user=await requireUser("ADMIN");await createCashRegister(String(form.get("name")??""),user.id);refresh();return {ok:"Caixa cadastrado."}; } catch(error){return {error:message(error)}}
}
export async function cashOpenAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user=await requirePermission(permissions.CASH_MANAGE);await openCashSession({registerId:String(form.get("registerId")??""),openingAmountCents:parseMoney(String(form.get("openingAmount")??"0")),notes:String(form.get("notes")??"")},user.id);refresh();return {ok:"Caixa aberto."}; } catch(error){return {error:message(error)}}
}
export async function cashMovementAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user=await requirePermission(permissions.CASH_MANAGE);await addCashMovement({sessionId:String(form.get("sessionId")??""),type:String(form.get("type")??""),amountCents:parseMoney(String(form.get("amount")??"0")),reason:String(form.get("reason")??"")},user.id,user.role==="ADMIN");refresh();return {ok:"Movimentação registrada."}; } catch(error){return {error:message(error)}}
}
export async function cashCloseAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user=await requirePermission(permissions.CASH_MANAGE);const result=await closeCashSession({sessionId:String(form.get("sessionId")??""),countedCents:parseMoney(String(form.get("countedAmount")??"0")),notes:String(form.get("notes")??"")},user.id,user.role==="ADMIN");refresh();return {ok:`Caixa fechado. Diferença: ${(result.differenceCents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}.`}; } catch(error){return {error:message(error)}}
}
