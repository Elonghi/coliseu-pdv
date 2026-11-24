import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COMANDA_TOKEN_LENGTH, comandaLink, parseComandaToken, publicBaseUrl, signComandaToken, verifyComandaToken } from "@/modules/comandas/token";

const id = "3f2b8c1e-9a4d-4e57-8b6a-1c2d3e4f5a6b";
const other = "9c1d2e3f-0a1b-4c5d-8e6f-7a8b9c0d1e2f";
const saved = { ...process.env };

describe("link assinado da comanda", () => {
  beforeEach(() => { process.env.COMANDA_LINK_SECRET = "segredo-de-teste-com-bastante-entropia-123456"; delete process.env.APP_URL; });
  afterEach(() => { process.env = { ...saved }; });

  it("o link confere com a versão certa e devolve o id da comanda", () => {
    const token = signComandaToken(id, 1);
    expect(token).toHaveLength(COMANDA_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const parsed = parseComandaToken(token)!;
    expect(parsed.comandaId).toBe(id);
    expect(verifyComandaToken(parsed, 1)).toBe(true);
  });

  it("trocar o QR (nova versão) invalida o link impresso", () => {
    const parsed = parseComandaToken(signComandaToken(id, 1))!;
    expect(verifyComandaToken(parsed, 2)).toBe(false);
    expect(verifyComandaToken(parseComandaToken(signComandaToken(id, 2))!, 2)).toBe(true);
  });

  it("não dá para montar o link de outra comanda só trocando o id nem adulterando a assinatura", () => {
    const real = signComandaToken(id, 1);
    const forgedId = signComandaToken(other, 1).slice(0, 22) + real.slice(22);
    expect(verifyComandaToken(parseComandaToken(forgedId)!, 1)).toBe(false);
    const flipped = real.slice(0, -1) + (real.endsWith("A") ? "B" : "A");
    expect(verifyComandaToken(parseComandaToken(flipped)!, 1)).toBe(false);
  });

  it("o número da comanda no link não serve: formato errado é recusado antes de qualquer consulta", () => {
    for (const bad of ["7", "comanda-7", "", "a".repeat(COMANDA_TOKEN_LENGTH - 1), "a".repeat(COMANDA_TOKEN_LENGTH + 1), `${"a".repeat(COMANDA_TOKEN_LENGTH - 1)}!`, "../../etc/passwd"]) {
      expect(parseComandaToken(bad), bad).toBeNull();
    }
  });

  it("um segredo diferente produz links que não conferem", () => {
    const token = signComandaToken(id, 1);
    process.env.COMANDA_LINK_SECRET = "outro-segredo-completamente-diferente-987654";
    expect(verifyComandaToken(parseComandaToken(token)!, 1)).toBe(false);
  });

  it("sem segredo configurado, recusa gerar o link em vez de usar um valor fraco", () => {
    delete process.env.COMANDA_LINK_SECRET; delete process.env.TOTP_ENCRYPTION_KEY; delete process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
    expect(() => signComandaToken(id, 1)).toThrow(/COMANDA_LINK_SECRET/);
  });

  it("usa TOTP_ENCRYPTION_KEY como segredo quando COMANDA_LINK_SECRET não existe (domínio separado do 2FA)", () => {
    const withDedicated = signComandaToken(id, 1);
    delete process.env.COMANDA_LINK_SECRET; process.env.TOTP_ENCRYPTION_KEY = "chave-do-2fa-de-teste-0123456789abcdef";
    const fallback = signComandaToken(id, 1);
    expect(fallback).not.toBe(withDedicated);
    expect(verifyComandaToken(parseComandaToken(fallback)!, 1)).toBe(true);
  });

  it("monta o endereço com APP_URL (sem barra final) ou com o que o proxy informou", () => {
    process.env.APP_URL = "https://pdv.exemplo.com.br/";
    expect(comandaLink(id, 1)).toMatch(new RegExp(`^https://pdv\\.exemplo\\.com\\.br/pedidos/[A-Za-z0-9_-]{${COMANDA_TOKEN_LENGTH}}$`));
    delete process.env.APP_URL;
    expect(publicBaseUrl(new Headers({ "x-forwarded-host": "loja.exemplo.com", "x-forwarded-proto": "https" }))).toBe("https://loja.exemplo.com");
  });
});
