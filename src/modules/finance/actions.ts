"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/modules/admin/actions";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { importOfx, reconcileBankTransaction, reverseFinancialSettlement, settleFinancialInstallmentsBatch } from "./service";

const message=(error:unknown)=>error instanceof Error?error.message:"Não foi possível concluir a operação.";
const refresh=()=>{revalidatePath("/admin/finance");revalidatePath("/admin")};
export async function financialBatchSettlementAction(_:ActionState,form:FormData):Promise<ActionState>{try{const user=await requirePermission(permissions.FINANCE_MANAGE);const count=await settleFinancialInstallmentsBatch({installmentIds:form.getAll("installmentIds").map(String),methodCode:String(form.get("methodCode")??""),occurredAt:String(form.get("occurredAt")??""),notes:String(form.get("notes")??"")},user.id);refresh();return{ok:`${count} duplicata(s) liquidada(s).`}}catch(error){return{error:message(error)}}}
export async function financialReversalAction(_:ActionState,form:FormData):Promise<ActionState>{try{const user=await requirePermission(permissions.FINANCE_MANAGE);await reverseFinancialSettlement(String(form.get("settlementId")??""),String(form.get("reason")??""),user.id);refresh();return{ok:"Baixa estornada e saldos recalculados."}}catch(error){return{error:message(error)}}}
export async function ofxImportAction(_:ActionState,form:FormData):Promise<ActionState>{try{const user=await requirePermission(permissions.FINANCE_MANAGE);const file=form.get("file");if(!(file instanceof File)||!file.size)throw new Error("Selecione um arquivo OFX.");const count=await importOfx(file.name,await file.text(),user.id);refresh();return{ok:`OFX importado com ${count} transação(ões).`}}catch(error){return{error:message(error)}}}
export async function bankReconcileAction(_:ActionState,form:FormData):Promise<ActionState>{try{const user=await requirePermission(permissions.FINANCE_MANAGE);await reconcileBankTransaction(String(form.get("transactionId")??""),String(form.get("settlementId")??""),user.id);refresh();return{ok:"Transação conciliada."}}catch(error){return{error:message(error)}}}
