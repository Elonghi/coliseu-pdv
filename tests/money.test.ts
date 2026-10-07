import { describe, expect, it } from "vitest";
import { calculateDiscount, formatMoney, parseMoney, saleNumber } from "@/lib/money";

describe("cálculos monetários", () => {
  it("arredonda desconto percentual ao centavo", () => { expect(calculateDiscount(199, 500)).toBe(10); expect(calculateDiscount(1800, 500)).toBe(90); });
  it("aceita e formata BRL sem usar ponto flutuante internamente", () => { expect(parseMoney("1.234,56")).toBe(123456); expect(formatMoney(900)).toContain("9,00"); });
  it("rejeita percentuais fora do intervalo", () => { expect(() => calculateDiscount(100, 10001)).toThrow(); });
  it("gera identificador legível", () => { expect(saleNumber(42)).toBe("VEN-000042"); });
});
