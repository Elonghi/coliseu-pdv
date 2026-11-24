import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";

/* Link do QR Code de uma comanda: `/pedidos/<token>`, onde o token é o id da comanda mais uma assinatura (HMAC-SHA256) que depende de
 * um segredo do servidor e da versão do QR da comanda. Não há nada guardado no banco: o link é recalculado sempre que o QR é gerado,
 * e quem não tem o segredo não consegue montar o link de outra comanda, mesmo conhecendo o número dela. Para invalidar um QR impresso
 * (comanda perdida ou fotografada) basta aumentar `comandas.token_version`. O segredo não pode mudar depois de imprimir os QR Codes. */

const ID_BYTES = 16;
const MAC_BYTES = 18;
const ID_CHARS = Math.ceil((ID_BYTES * 4) / 3);
const MAC_CHARS = Math.ceil((MAC_BYTES * 4) / 3);
export const COMANDA_TOKEN_LENGTH = ID_CHARS + MAC_CHARS;

function secret() {
  const base = process.env.COMANDA_LINK_SECRET ?? process.env.TOTP_ENCRYPTION_KEY ?? process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!base) throw new AppError("Configure COMANDA_LINK_SECRET no ambiente para gerar os QR Codes das comandas.", 503, "COMANDA_SECRET_MISSING");
  return createHmac("sha256", base).update("coliseon:comanda-link:v1").digest();
}

const mac = (id: Buffer, version: number) => createHmac("sha256", secret()).update(id).update(`:${version}`).digest().subarray(0, MAC_BYTES);

const uuidToBytes = (value: string) => Buffer.from(value.replace(/-/g, ""), "hex");
const bytesToUuid = (bytes: Buffer) => { const hex = bytes.toString("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; };

export function signComandaToken(comandaId: string, version: number) {
  const id = uuidToBytes(comandaId);
  if (id.length !== ID_BYTES) throw new AppError("Comanda inválida.", 422);
  return `${id.toString("base64url")}${mac(id, version).toString("base64url")}`;
}

export type ParsedComandaToken = { comandaId: string; mac: Buffer; id: Buffer };

/** Só confere o formato e separa o id da comanda. Quem usa ainda precisa buscar a versão no banco e chamar `verifyComandaToken`. */
export function parseComandaToken(token: string): ParsedComandaToken | null {
  if (typeof token !== "string" || token.length !== COMANDA_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const id = Buffer.from(token.slice(0, ID_CHARS), "base64url");
  const signature = Buffer.from(token.slice(ID_CHARS), "base64url");
  if (id.length !== ID_BYTES || signature.length !== MAC_BYTES) return null;
  return { comandaId: bytesToUuid(id), mac: signature, id };
}

export function verifyComandaToken(parsed: ParsedComandaToken, version: number) {
  const expected = mac(parsed.id, version);
  return expected.length === parsed.mac.length && timingSafeEqual(expected, parsed.mac);
}

/** Endereço público do sistema, sem barra no final: APP_URL, ou o que o proxy informou na requisição. */
export function publicBaseUrl(headers?: Headers) {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = headers?.get("x-forwarded-host")?.split(",")[0]?.trim() ?? headers?.get("host");
  const proto = headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  return host ? `${proto}://${host}` : "";
}

export const comandaLink = (comandaId: string, version: number, headers?: Headers) => `${publicBaseUrl(headers)}/pedidos/${signComandaToken(comandaId, version)}`;
