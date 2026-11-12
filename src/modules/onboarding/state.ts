import { cookies } from "next/headers";

/* O guia é uma conveniência de cada navegador: lembra se a pessoa já viu a boas-vindas e se dispensou o guia.
 * Fica em cookie (um por usuário, para dois logins no mesmo navegador não se misturarem), sem coluna nova no banco. */
export type GuideCookie = "welcomed" | "dismissed";

export const guideCookieName = (userId: string) => `coliseu_guide_${userId.replace(/-/g, "").slice(0, 16)}`;

export async function readGuideCookie(userId: string): Promise<GuideCookie | null> {
  const value = (await cookies()).get(guideCookieName(userId))?.value;
  return value === "welcomed" || value === "dismissed" ? value : null;
}
