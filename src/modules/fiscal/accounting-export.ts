import { strToU8, zipSync } from "fflate";
import { fiscalDirection, fiscalDirectionLabel } from "./direction";

export type AccountingInvoice = {
  access_key: string; has_full_xml: boolean; status: string; issue_at: Date | null; model: string | null;
  series: string | null; number: string | null; total_cents: number | null; issuer_name: string | null;
  issuer_cnpj_cpf: string | null; recipient_name: string | null; recipient_cnpj_cpf: string | null; raw_xml: string | null;
};

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildAccountingCsv(companyCnpj: string, invoices: AccountingInvoice[]) {
  const header = ["Tipo", "Emissão", "Número", "Série", "Modelo", "Chave de acesso", "Situação", "Emitente", "CNPJ/CPF emitente", "Destinatário", "CNPJ/CPF destinatário", "Valor total", "XML completo"];
  const rows = invoices.map((invoice) => {
    const direction = fiscalDirection(companyCnpj, invoice.issuer_cnpj_cpf, invoice.recipient_cnpj_cpf);
    return [fiscalDirectionLabel(direction), invoice.issue_at?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "", invoice.number, invoice.series, invoice.model, invoice.access_key, invoice.status, invoice.issuer_name, invoice.issuer_cnpj_cpf, invoice.recipient_name, invoice.recipient_cnpj_cpf, ((invoice.total_cents ?? 0) / 100).toFixed(2).replace(".", ","), invoice.has_full_xml ? "Sim" : "Não"];
  });
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

export function buildAccountingZip(companyCnpj: string, invoices: AccountingInvoice[]) {
  const files: Record<string, Uint8Array> = {};
  let xmlCount = 0;
  let summaryCount = 0;
  for (const invoice of invoices) {
    const direction = fiscalDirection(companyCnpj, invoice.issuer_cnpj_cpf, invoice.recipient_cnpj_cpf);
    if (invoice.has_full_xml && invoice.raw_xml) {
      const folder = direction === "ENTRY" ? "xml/entradas" : direction === "EXIT" ? "xml/saidas" : "xml/outras";
      files[`${folder}/NFe-${invoice.access_key}.xml`] = strToU8(invoice.raw_xml);
      xmlCount += 1;
    } else summaryCount += 1;
  }
  files["resumo-notas.csv"] = strToU8(buildAccountingCsv(companyCnpj, invoices));
  files["LEIA-ME.txt"] = strToU8([
    "EXPORTAÇÃO FISCAL PARA CONTABILIDADE",
    "",
    `Documentos listados: ${invoices.length}`,
    `XMLs completos incluídos: ${xmlCount}`,
    `Resumos sem XML completo: ${summaryCount}`,
    "",
    "Os XMLs estão separados em entradas, saídas e outras operações pela posição do CNPJ da empresa.",
    "Registros disponíveis apenas como resumo constam no CSV, mas não geram arquivo XML fiscal.",
    "O XML autorizado é o documento fiscal eletrônico com validade jurídica; o DANFE é apenas sua representação auxiliar.",
  ].join("\r\n"));
  return { archive: zipSync(files, { level: 6 }), xmlCount, summaryCount };
}
