"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { shouldUseSecureSessionCookie } from "@/lib/security";
import { requireUser } from "./session";
import { ALL_STORES, STORE_COOKIE } from "./stores";

/* Troca a loja ativa do painel: uma das lojas a que a pessoa tem acesso, ou "Todas as lojas" (só quem tem mais de uma). */
export async function selectStoreAction(form: FormData) {
  const user = await requireUser();
  const requested = String(form.get("store") ?? "");
  const allowed = requested === ALL_STORES ? user.stores.length > 1 : user.stores.some((store) => store.id === requested);
  if (!allowed) return;
  (await cookies()).set(STORE_COOKIE, requested, { httpOnly: true, secure: shouldUseSecureSessionCookie(), sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  revalidatePath("/", "layout");
}
