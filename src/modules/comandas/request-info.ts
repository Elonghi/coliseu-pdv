import { z } from "zod";

/* O que a requisição conta sobre quem a fez: IP, navegador e aparelho. Entra na auditoria das comandas. */

export type RequestInfo = { ip: string | null; userAgent: string | null; deviceInfo: Record<string, unknown> };

/** Quantos proxies de confiança ficam entre o cliente e o app (no Coolify, o Traefik: 1). O IP do cliente é o que o primeiro proxy
 * de confiança viu, ou seja, a entrada de X-Forwarded-For contada a partir do fim: as anteriores o cliente pode ter inventado. */
const trustedHops = () => Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);

export function clientIp(headers: Headers) {
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const picked = chain.length ? chain[Math.max(0, chain.length - trustedHops())] : headers.get("x-real-ip")?.trim();
  // Servidor dual-stack entrega IPv4 como "::ffff:203.0.113.9": guarda como IPv4 puro, para a contagem de tentativas e a anonimização valerem igual.
  return picked ? picked.replace(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i, "$1").slice(0, 64) : null;
}

/** O que dá para saber pelo User-Agent. O modelo só aparece em alguns Android (o iPhone não informa, e o Chrome novo esconde). */
export function describeUserAgent(userAgent: string | null) {
  const ua = userAgent ?? "";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  const model = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.trim();
  return { os, browser, mobile: /Mobi|Android|iPhone|iPad/.test(ua), model: model && model !== "K" ? model.slice(0, 60) : null };
}

/** Informações que só o navegador sabe; chegam no corpo do pedido e são tratadas como texto livre limitado. */
export const clientDeviceSchema = z.object({
  screen: z.string().max(20).optional(),
  language: z.string().max(20).optional(),
  timezone: z.string().max(60).optional(),
  touch: z.boolean().optional(),
}).partial();

export function requestInfo(headers: Headers, client?: z.infer<typeof clientDeviceSchema> | null): RequestInfo {
  const userAgent = headers.get("user-agent")?.slice(0, 400) ?? null;
  const chain = headers.get("x-forwarded-for")?.slice(0, 200);
  return { ip: clientIp(headers), userAgent, deviceInfo: { ...describeUserAgent(userAgent), ...(client ?? {}), ...(chain ? { forwardedFor: chain } : {}) } };
}
