import { describe, expect, it } from "vitest";
import { maskCnpj, maskPhone, onlyDigits } from "@/lib/masks";
import { readableError } from "@/lib/validation-message";

describe("máscaras de formulário", () => {
  it("formata o CNPJ progressivamente e descarta o excesso", () => {
    expect(maskCnpj("")).toBe("");
    expect(maskCnpj("11")).toBe("11");
    expect(maskCnpj("112223")).toBe("11.222.3");
    expect(maskCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(maskCnpj("11.222.333/0001-81999")).toBe("11.222.333/0001-81");
    expect(onlyDigits(maskCnpj("11222333000181"))).toBe("11222333000181");
  });

  it("formata telefone fixo, celular e 0800 e ignora o código do país", () => {
    expect(maskPhone("1")).toBe("(1");
    expect(maskPhone("11987")).toBe("(11) 987");
    expect(maskPhone("1123456789")).toBe("(11) 2345-6789");
    expect(maskPhone("11987654321")).toBe("(11) 98765-4321");
    expect(maskPhone("+55 11 98765-4321")).toBe("(11) 98765-4321");
    expect(maskPhone("08001234567")).toBe("0800 123 4567");
    expect(maskPhone("")).toBe("");
  });
});

describe("mensagens de validação legíveis", () => {
  it("converte o JSON do Zod em frase e preserva textos comuns", () => {
    const zod = JSON.stringify([{ origin: "string", code: "invalid_format", format: "regex", pattern: "/^\\d{14}$/", path: ["document"], message: "Invalid string: must match pattern /^\\d{14}$/" }]);
    expect(readableError(zod)).toBe("Confira os dados informados. CNPJ: formato inválido.");
    const custom = JSON.stringify([{ code: "invalid_format", path: ["document"], message: "O CNPJ deve ter 14 dígitos (ou deixe em branco)." }]);
    expect(readableError(custom)).toBe("Confira os dados informados. O CNPJ deve ter 14 dígitos (ou deixe em branco).");
    expect(readableError("Estoque insuficiente.")).toBe("Estoque insuficiente.");
    expect(readableError("[não é json")).toBe("[não é json");
    expect(readableError(undefined)).toBeUndefined();
  });
});
