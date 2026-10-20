import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildAccountingCsv, buildAccountingZip, type AccountingInvoice } from "@/modules/fiscal/accounting-export";
import { extractDanfeData, generateDanfePdf } from "@/modules/fiscal/danfe";
import { fiscalDirection } from "@/modules/fiscal/direction";
import { accessKey, fullXml } from "./fixtures/fiscal";

const companyCnpj = "98765432000199";
const invoice: AccountingInvoice = {
  access_key: accessKey, has_full_xml: true, status: "AUTHORIZED", issue_at: new Date("2026-10-14T10:30:00-03:00"),
  model: "55", series: "1", number: "123", total_cents: 123456, issuer_name: "Distribuidora Coliseu",
  issuer_cnpj_cpf: "12345678000123", recipient_name: "Loja Coliseu", recipient_cnpj_cpf: companyCnpj, raw_xml: fullXml,
};

describe("documentos fiscais para operação e contabilidade", () => {
  it("classifica entrada e saída pela posição do CNPJ da loja", () => {
    expect(fiscalDirection(companyCnpj, "12345678000123", companyCnpj)).toBe("ENTRY");
    expect(fiscalDirection(companyCnpj, "12345678000123", null)).toBe("ENTRY");
    expect(fiscalDirection(companyCnpj, companyCnpj, "12345678000123")).toBe("EXIT");
    expect(fiscalDirection(companyCnpj, "11111111000111", "22222222000122")).toBe("OTHER");
  });

  it("extrai os campos que compõem o DANFE", () => {
    const danfe = extractDanfeData(fullXml);
    expect(danfe).toMatchObject({ accessKey, number: "123", series: "1", operationNature: "Compra de mercadoria" });
    expect(danfe.issuer.name).toBe("Distribuidora Coliseu");
    expect(danfe.recipient.document).toBe("98.765.432/0001-99");
    expect(danfe.items[0]).toMatchObject({ code: "MTG-BOX", description: "Display de boosters Magic", cfop: "5102", total: "1.234,56" });
  });

  it("gera um PDF válido para a NF-e completa", async () => {
    const pdf = await generateDanfePdf(fullXml);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2_000);
  });

  it("exporta XMLs separados e resumo CSV em um ZIP", () => {
    const csv = buildAccountingCsv(companyCnpj, [invoice]);
    expect(csv).toContain("Entrada");
    expect(csv).toContain(accessKey);
    const { archive, xmlCount, summaryCount } = buildAccountingZip(companyCnpj, [invoice, { ...invoice, access_key: "1".repeat(44), has_full_xml: false, raw_xml: null }]);
    const files = unzipSync(archive);
    expect(xmlCount).toBe(1);
    expect(summaryCount).toBe(1);
    expect(strFromU8(files[`xml/entradas/NFe-${accessKey}.xml`])).toContain("<nfeProc");
    expect(strFromU8(files["resumo-notas.csv"])).toContain("XML completo");
    expect(strFromU8(files["LEIA-ME.txt"])).toContain("Resumos sem XML completo: 1");
  });
});
