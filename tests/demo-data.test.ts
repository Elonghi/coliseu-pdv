import { describe, expect, it } from "vitest";
import { normalizeDfeXml } from "@/modules/fiscal/xml";
import { accessKey, buildNfe, demoCatalog, demoCnpj, demoEan, ean13Digit, mulberry32 } from "@/modules/platform/demo-data";

describe("dados do cliente de demonstração", () => {
  it("todo produto tem SKU único e EAN-13 válido e único (as etiquetas imprimem código de barras)", () => {
    expect(new Set(demoCatalog.map((product) => product.sku)).size).toBe(demoCatalog.length);
    const eans = demoCatalog.map((_, index) => demoEan(index + 1));
    expect(new Set(eans).size).toBe(eans.length);
    for (const ean of eans) { expect(ean).toMatch(/^789\d{10}$/); expect(ean13Digit(ean.slice(0, 12))).toBe(ean[12]); }
  });

  it("o catálogo tem preço acima do custo, categorias variadas e produtos de caixa para abertura em boosters", () => {
    expect(demoCatalog.length).toBeGreaterThanOrEqual(30);
    expect(new Set(demoCatalog.map((product) => product.category)).size).toBe(5);
    for (const product of demoCatalog) expect(product.priceCents, product.sku).toBeGreaterThan(product.costCents);
    expect(demoCatalog.some((product) => product.splittable)).toBe(true);
    expect(demoCatalog.some((product) => product.loose)).toBe(true);
  });

  it("CNPJ fictício com dígitos verificadores corretos", () => {
    const check = (cnpj: string) => {
      const digit = (digits: string, weights: number[]) => { const rest = [...digits].reduce((sum, value, index) => sum + Number(value) * weights[index], 0) % 11; return rest < 2 ? 0 : 11 - rest; };
      const first = digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      return cnpj.endsWith(`${first}${digit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`);
    };
    for (const index of [1, 2, 10, 11]) { expect(demoCnpj(index)).toMatch(/^\d{14}$/); expect(check(demoCnpj(index))).toBe(true); }
    expect(demoCnpj(1)).not.toBe(demoCnpj(2));
  });

  it("a chave de acesso tem 44 dígitos e o dígito verificador do módulo 11", () => {
    const key = accessKey({ uf: 35, emittedAt: new Date("2026-10-14T10:30:00Z"), cnpj: demoCnpj(10), number: 1001, code: 12_345_678 });
    expect(key).toMatch(/^\d{44}$/);
    expect(key.slice(0, 6)).toBe("352610");
    const body = key.slice(0, 43);
    const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (2 + (index % 8)), 0);
    expect(Number(key[43])).toBe(sum % 11 < 2 ? 0 : 11 - (sum % 11));
  });

  it("a NF-e gerada é lida pelo importador: itens, totais e duplicatas conferem", () => {
    const items = [
      { sku: "MTG-BST-PLY", name: "Magic — Play Booster & Cia <teste>", ean: demoEan(1), unit: "PCT", quantity: 10, unitCostCents: 2600 },
      { sku: "ACC-DICE", name: "Kit de dados", ean: demoEan(21), unit: "UN", quantity: 5, unitCostCents: 900 },
    ];
    const nfe = buildNfe({ number: 4321, emittedAt: new Date("2026-10-14T12:00:00Z"), supplier: { name: "Distribuidora", cnpj: demoCnpj(10) }, recipient: { name: "Loja", cnpj: demoCnpj(1) }, items, dueInDays: [30, 60, 90], random: mulberry32(1) });
    expect(nfe.totalCents).toBe(10 * 2600 + 5 * 900);
    const parsed = normalizeDfeXml(nfe.xml);
    expect(parsed.kind).toBe("NFE");
    expect(parsed.invoice?.hasFullXml).toBe(true);
    expect(parsed.invoice?.accessKey).toBe(nfe.key);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({ productCode: "MTG-BST-PLY", ean: demoEan(1), unit: "PCT", unitValueCents: 2600 });
    expect(parsed.items[0].description).toContain("&");
    expect(parsed.billing?.duplicates).toHaveLength(3);
    expect(parsed.billing?.duplicates.reduce((sum, duplicate) => sum + duplicate.amountCents, 0)).toBe(nfe.totalCents);
    expect(parsed.billing?.netCents).toBe(nfe.totalCents);
    expect(parsed.invoice?.issuerCnpjCpf).toBe(demoCnpj(10));
    expect(parsed.invoice?.recipientCnpjCpf).toBe(demoCnpj(1));
  });

  it("a semente gera sempre os mesmos números", () => {
    const a = mulberry32(2026); const b = mulberry32(2026);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
