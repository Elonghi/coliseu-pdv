"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { ActionState } from "@/modules/admin/actions";
import { requirePlatformAdmin } from "@/modules/auth/session";
import { addStore, asPlatform, createAccount, resetOwnerPassword, setAccountActive, updateAccount, updateStore } from "./service";

function describe(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Dados inválidos.";
  if (typeof error === "object" && error && "code" in error && error.code === "23505") return "E-mail ou CNPJ já cadastrado.";
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const limit = (form: FormData) => { const value = text(form, "maxStores").trim(); return value === "" ? null : Number(value); };

export async function createAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requirePlatformAdmin();
    await asPlatform(() => createAccount({
      name: text(form, "name"), ownerName: text(form, "ownerName"), ownerEmail: text(form, "ownerEmail"), ownerPassword: text(form, "ownerPassword"),
      storeName: text(form, "storeName"), storeCnpj: text(form, "storeCnpj"), maxStores: limit(form), notes: text(form, "notes"),
    }, actor.id));
    revalidatePath("/plataforma");
    return { ok: "Lojista criado. Passe ao titular o e-mail e a senha provisória." };
  } catch (error) { return { error: describe(error) }; }
}

export async function createDemoAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requirePlatformAdmin();
    const { createDemoAccount } = await import("./demo");
    const result = await createDemoAccount({ name: text(form, "name"), ownerEmail: text(form, "ownerEmail"), password: text(form, "password") }, actor.id);
    revalidatePath("/plataforma");
    return { ok: `Demonstração criada: ${result.counts.sales} vendas, ${result.counts.invoices} notas fiscais e ${result.counts.products} produtos em ${result.counts.stores} lojas. Titular: ${result.logins[0].email}. A equipe usa o mesmo e-mail com +gerente-shopping, +caixa-centro e +caixa-shopping, todos com a mesma senha.` };
  } catch (error) { return { error: describe(error) }; }
}

export async function addStoreAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requirePlatformAdmin();
    const accountId = text(form, "accountId");
    await asPlatform(() => addStore(accountId, { name: text(form, "name"), cnpj: text(form, "cnpj") }, actor.id));
    revalidatePath(`/plataforma/lojistas/${accountId}`); revalidatePath("/plataforma");
    return { ok: "Loja adicionada. O titular já enxerga a nova loja no seletor." };
  } catch (error) { return { error: describe(error) }; }
}

export async function updateAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requirePlatformAdmin();
    const accountId = text(form, "accountId");
    await asPlatform(() => updateAccount(accountId, { name: text(form, "name"), notes: text(form, "notes"), maxStores: limit(form) }, actor.id));
    revalidatePath(`/plataforma/lojistas/${accountId}`); revalidatePath("/plataforma");
    return { ok: "Dados do lojista atualizados." };
  } catch (error) { return { error: describe(error) }; }
}

export async function updateStoreAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requirePlatformAdmin();
    const accountId = text(form, "accountId");
    await asPlatform(() => updateStore(text(form, "storeId"), { name: text(form, "name"), cnpj: text(form, "cnpj"), active: form.get("active") === "true" }, actor.id));
    revalidatePath(`/plataforma/lojistas/${accountId}`);
    return { ok: "Loja atualizada." };
  } catch (error) { return { error: describe(error) }; }
}

export async function setAccountActiveAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requirePlatformAdmin();
    const accountId = text(form, "accountId");
    const active = form.get("active") === "true";
    await asPlatform(() => setAccountActive(accountId, active, actor.id));
    revalidatePath(`/plataforma/lojistas/${accountId}`); revalidatePath("/plataforma");
    return { ok: active ? "Lojista reativado." : "Lojista suspenso. Ninguém dele consegue entrar até a reativação." };
  } catch (error) { return { error: describe(error) }; }
}

export async function resetOwnerPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requirePlatformAdmin();
    await asPlatform(() => resetOwnerPassword(text(form, "accountId"), text(form, "password"), actor.id));
    return { ok: "Senha provisória definida e sessões do titular encerradas." };
  } catch (error) { return { error: describe(error) }; }
}
