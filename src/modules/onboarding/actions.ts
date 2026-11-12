"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { shouldUseSecureSessionCookie } from "@/lib/security";
import { requireUser } from "@/modules/auth/session";
import { guideCookieName, type GuideCookie } from "./state";

async function remember(value: GuideCookie | null) {
  const user = await requireUser();
  const jar = await cookies();
  if (value) jar.set(guideCookieName(user.id), value, { httpOnly: true, secure: shouldUseSecureSessionCookie(), sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  else jar.delete(guideCookieName(user.id));
}

/** Boas-vindas vistas: o painel para de levar a pessoa ao guia sozinho. Não mexe em "dispensado". */
export async function markGuideWelcomedAction() {
  const user = await requireUser();
  if ((await cookies()).get(guideCookieName(user.id))?.value === "dismissed") return;
  await remember("welcomed");
}

/** Esconde o cartão do guia no painel e os avisos nas telas. A página Primeiros passos continua no menu. */
export async function dismissGuideAction() {
  await remember("dismissed");
  revalidatePath("/admin", "layout");
}

/** Volta a mostrar o guia no painel e nas telas. */
export async function resumeGuideAction() {
  await remember("welcomed");
  revalidatePath("/admin", "layout");
}
