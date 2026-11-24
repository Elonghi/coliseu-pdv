import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/* Token do agente de impressão: "cpa1.<loja>.<impressora>.<segredo>". A loja e a impressora não são segredo; servem
 * para o servidor abrir o escopo certo do banco (as tabelas de loja ficam invisíveis sem escopo, pelo RLS) antes de
 * conferir o segredo. Só o hash SHA-256 do token inteiro fica gravado. */
const PREFIX = "cpa1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const hashAgentToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function createAgentToken(storeId: string, terminalId: string) {
  const token = `${PREFIX}.${storeId}.${terminalId}.${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashAgentToken(token) };
}

export function parseAgentToken(token: string): { storeId: string; terminalId: string } | null {
  const parts = token.trim().split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX || !UUID.test(parts[1]) || !UUID.test(parts[2]) || parts[3].length < 32) return null;
  return { storeId: parts[1].toLowerCase(), terminalId: parts[2].toLowerCase() };
}

export function sameHash(expectedHex: string, token: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(hashAgentToken(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}
