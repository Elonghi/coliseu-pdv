import { describe, expect, it } from "vitest";
import { requireSameOrigin, shouldUseSecureSessionCookie } from "@/lib/security";
import { ean13Bits, ean13Check } from "@/lib/barcode";
import { decryptTotpSecret, encryptTotpSecret, generateTotpCode, generateTotpSecret, verifyTotp } from "@/modules/auth/totp";

describe("proteção de origem das APIs mutáveis",()=>{
  it("aceita mesma origem e rejeita origem diferente",()=>{
    expect(()=>requireSameOrigin(new Request("http://localhost/api/sales",{headers:{host:"localhost",origin:"http://localhost"}}))).not.toThrow();
    expect(()=>requireSameOrigin(new Request("http://localhost/api/sales",{headers:{host:"localhost",origin:"https://evil.example"}}))).toThrow(/Origem/);
  });

  it("mantém cookies seguros por padrão em produção e permite HTTP explicitamente",()=>{
    expect(shouldUseSecureSessionCookie("production",undefined)).toBe(true);
    expect(shouldUseSecureSessionCookie("production","false")).toBe(false);
    expect(shouldUseSecureSessionCookie("development", "true")).toBe(true);
  });

  it("gera EAN-13 interno válido e barras completas",()=>{const payload="201234567890",ean=payload+ean13Check(payload);expect(ean).toHaveLength(13);expect(ean13Bits(ean)).toHaveLength(95)});

  it("protege e valida o segredo TOTP",()=>{process.env.TOTP_ENCRYPTION_KEY="segredo-de-teste-comprido";const secret=generateTotpSecret(),encrypted=encryptTotpSecret(secret),now=1_800_000_000_000;expect(encrypted).not.toContain(secret);expect(decryptTotpSecret(encrypted)).toBe(secret);expect(verifyTotp(secret,generateTotpCode(secret,now),now)).toBe(true);expect(verifyTotp(secret,"000000",now)).toBe(false)});
});
