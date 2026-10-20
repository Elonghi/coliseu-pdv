import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";
import { findNode, parseXml, type XmlObject, type XmlValue } from "./xml";

type DanfeParty = { name: string; document: string; stateRegistration: string; address: string; city: string; state: string; zip: string; phone: string };
type DanfeItem = { code: string; description: string; ncm: string; cst: string; cfop: string; unit: string; quantity: string; unitValue: string; total: string; taxBase: string; icms: string; ipi: string; icmsRate: string; ipiRate: string };
export type DanfeData = {
  accessKey: string; number: string; series: string; model: string; operationType: string; operationNature: string;
  issueAt: string; exitAt: string; protocol: string; authorizationAt: string;
  issuer: DanfeParty; recipient: DanfeParty; items: DanfeItem[];
  totals: Record<string, string>; additionalInfo: string;
};

const record = (value: XmlValue | undefined): XmlObject => value && typeof value === "object" && !Array.isArray(value) ? value as XmlObject : {};
const list = (value: XmlValue | undefined): XmlValue[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value: XmlValue | undefined): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return text(record(value)["#text"]);
  return String(value).trim();
};
const firstText = (value: XmlValue, key: string) => text(findNode(value, key)?.[key] ?? findValue(value, key));
function findValue(value: XmlValue, key: string): XmlValue | undefined {
  if (Array.isArray(value)) { for (const entry of value) { const found = findValue(entry, key); if (found !== undefined) return found; } return undefined; }
  const current = record(value);
  if (current[key] !== undefined) return current[key];
  for (const entry of Object.values(current)) { const found = findValue(entry, key); if (found !== undefined) return found; }
  return undefined;
}
const formatDocument = (value: string) => value.length === 14 ? value.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5") : value.length === 11 ? value.replace(/(.{3})(.{3})(.{3})(.{2})/, "$1.$2.$3-$4") : value;
const formatZip = (value: string) => value.length === 8 ? value.replace(/(.{5})(.{3})/, "$1-$2") : value;
const formatDate = (value: string, withTime = false) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...(withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }) });
};
const money = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00";
};
const decimal = (value: string, digits = 4) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "0,0000";
};

function party(node: XmlObject, addressKey: "enderEmit" | "enderDest"): DanfeParty {
  const address = record(node[addressKey]);
  const street = [text(address.xLgr), text(address.nro)].filter(Boolean).join(", ");
  const complement = [text(address.xCpl), text(address.xBairro)].filter(Boolean).join(" - ");
  return {
    name: text(node.xNome) || text(node.xFant) || "NAO IDENTIFICADO",
    document: formatDocument(text(node.CNPJ) || text(node.CPF)),
    stateRegistration: text(node.IE),
    address: [street, complement].filter(Boolean).join(" - "),
    city: text(address.xMun), state: text(address.UF), zip: formatZip(text(address.CEP)), phone: text(address.fone),
  };
}

export function extractDanfeData(rawXml: string): DanfeData {
  const parsed = parseXml(rawXml);
  const process = findNode(parsed, "nfeProc") ?? parsed;
  const info = findNode(process, "infNFe");
  if (!info) throw new Error("O XML não contém uma NF-e completa (infNFe).");
  const ide = record(info.ide);
  const issuer = record(info.emit);
  const recipient = record(info.dest);
  const totalsNode = record(record(info.total).ICMSTot);
  const protocol = findNode(process, "infProt") ?? {};
  const accessKey = (text(info["@_Id"]) || text(protocol.chNFe)).replace(/^NFe/, "");
  if (!/^\d{44}$/.test(accessKey)) throw new Error("Chave de acesso inválida no XML da NF-e.");

  const items = list(info.det).map((entry) => {
    const detail = record(entry); const product = record(detail.prod); const taxes = record(detail.imposto);
    return {
      code: text(product.cProd), description: text(product.xProd), ncm: text(product.NCM),
      cst: firstText(taxes, "CST") || firstText(taxes, "CSOSN"), cfop: text(product.CFOP), unit: text(product.uCom),
      quantity: decimal(text(product.qCom)), unitValue: money(text(product.vUnCom)), total: money(text(product.vProd)),
      taxBase: money(firstText(taxes, "vBC")), icms: money(firstText(taxes, "vICMS")), ipi: money(firstText(taxes, "vIPI")),
      icmsRate: money(firstText(taxes, "pICMS")), ipiRate: money(firstText(taxes, "pIPI")),
    } satisfies DanfeItem;
  });
  return {
    accessKey, number: text(ide.nNF), series: text(ide.serie), model: text(ide.mod),
    operationType: text(ide.tpNF) === "0" ? "0 - ENTRADA" : "1 - SAIDA", operationNature: text(ide.natOp),
    issueAt: formatDate(text(ide.dhEmi) || text(ide.dEmi)), exitAt: formatDate(text(ide.dhSaiEnt) || text(ide.dSaiEnt), true),
    protocol: text(protocol.nProt), authorizationAt: formatDate(text(protocol.dhRecbto), true),
    issuer: party(issuer, "enderEmit"), recipient: party(recipient, "enderDest"), items,
    totals: {
      taxBase: money(text(totalsNode.vBC)), icms: money(text(totalsNode.vICMS)), icmsExempt: money(text(totalsNode.vICMSDeson)),
      fcp: money(text(totalsNode.vFCP)), products: money(text(totalsNode.vProd)), freight: money(text(totalsNode.vFrete)),
      insurance: money(text(totalsNode.vSeg)), discount: money(text(totalsNode.vDesc)), ii: money(text(totalsNode.vII)),
      ipi: money(text(totalsNode.vIPI)), pis: money(text(totalsNode.vPIS)), cofins: money(text(totalsNode.vCOFINS)),
      other: money(text(totalsNode.vOutro)), invoice: money(text(totalsNode.vNF)),
    },
    additionalInfo: text(record(info.infAdic).infCpl),
  };
}

const PAGE = { width: 595.28, height: 841.89, margin: 24 };
const colors = { ink: "#111827", muted: "#4b5563", line: "#1f2937", fill: "#f3f4f6" };

function box(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, label: string, value: string, options?: { size?: number; bold?: boolean; align?: "left" | "center" | "right" }) {
  doc.rect(x, y, width, height).stroke(colors.line);
  doc.font("Helvetica").fontSize(5.5).fillColor(colors.muted).text(label.toUpperCase(), x + 3, y + 2, { width: width - 6, lineBreak: false });
  doc.font(options?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(options?.size ?? 7.2).fillColor(colors.ink).text(value, x + 3, y + 11, { width: width - 6, height: height - 12, align: options?.align ?? "left", ellipsis: true });
}
function pageFooter(doc: PDFKit.PDFDocument, page: number) {
  doc.font("Helvetica").fontSize(5.5).fillColor(colors.muted).text(`DANFE gerado pelo sistema Coliseu PDV · Pagina ${page}`, PAGE.margin, PAGE.height - 16, { width: PAGE.width - PAGE.margin * 2, align: "center", lineBreak: false });
}

async function barcode(accessKey: string) {
  return bwipjs.toBuffer({ bcid: "code128", text: accessKey, scale: 2, height: 9, includetext: false, padding: 0, backgroundcolor: "FFFFFF" });
}

export async function generateDanfePdf(rawXml: string): Promise<Buffer> {
  const data = extractDanfeData(rawXml);
  const barcodeImage = await barcode(data.accessKey);
  const doc = new PDFDocument({ size: "A4", margin: PAGE.margin, autoFirstPage: false, info: { Title: `DANFE NF-e ${data.number}`, Author: data.issuer.name, Subject: `Documento Auxiliar da NF-e ${data.accessKey}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const result = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  let page = 0;
  let y = 0;

  const header = () => {
    page += 1; doc.addPage(); y = PAGE.margin;
    const usable = PAGE.width - PAGE.margin * 2;
    box(doc, PAGE.margin, y, 226, 68, "Emitente", `${data.issuer.name}\n${data.issuer.address}\n${[data.issuer.city, data.issuer.state, data.issuer.zip].filter(Boolean).join(" - ")}\nCNPJ/CPF: ${data.issuer.document}  IE: ${data.issuer.stateRegistration}`, { bold: true, size: 7.2 });
    box(doc, PAGE.margin + 226, y, 80, 68, "DANFE", `Documento Auxiliar da\nNota Fiscal Eletronica\n\n${data.operationType}\nNº ${data.number}\nSerie ${data.series}`, { bold: true, align: "center", size: 7 });
    doc.rect(PAGE.margin + 306, y, usable - 306, 68).stroke(colors.line);
    doc.image(barcodeImage, PAGE.margin + 316, y + 8, { fit: [usable - 326, 28], align: "center" });
    doc.font("Helvetica-Bold").fontSize(6).fillColor(colors.ink).text(data.accessKey.replace(/(\d{4})(?=\d)/g, "$1 "), PAGE.margin + 310, y + 41, { width: usable - 314, align: "center", lineBreak: false });
    doc.font("Helvetica").fontSize(5.5).text("Consulta de autenticidade no portal nacional da NF-e ou no site da SEFAZ autorizadora", PAGE.margin + 310, y + 53, { width: usable - 314, align: "center" });
    y += 68;
    box(doc, PAGE.margin, y, 306, 31, "Natureza da operação", data.operationNature, { bold: true });
    box(doc, PAGE.margin + 306, y, usable - 306, 31, "Protocolo de autorização de uso", `${data.protocol} ${data.authorizationAt}`, { bold: true, align: "center" });
    y += 37;
    doc.font("Helvetica-Bold").fontSize(6).text("DESTINATARIO / REMETENTE", PAGE.margin, y); y += 8;
    box(doc, PAGE.margin, y, 298, 32, "Nome / Razao social", data.recipient.name, { bold: true });
    box(doc, PAGE.margin + 298, y, 136, 32, "CNPJ / CPF", data.recipient.document, { bold: true });
    box(doc, PAGE.margin + 434, y, usable - 434, 32, "Data de emissao", data.issueAt, { bold: true }); y += 32;
    box(doc, PAGE.margin, y, 260, 32, "Endereco", data.recipient.address);
    box(doc, PAGE.margin + 260, y, 102, 32, "Bairro / Distrito", "");
    box(doc, PAGE.margin + 362, y, 72, 32, "CEP", data.recipient.zip);
    box(doc, PAGE.margin + 434, y, usable - 434, 32, "Data / hora saida", data.exitAt); y += 32;
    box(doc, PAGE.margin, y, 260, 32, "Municipio", data.recipient.city);
    box(doc, PAGE.margin + 260, y, 48, 32, "UF", data.recipient.state, { align: "center" });
    box(doc, PAGE.margin + 308, y, 126, 32, "Fone", data.recipient.phone);
    box(doc, PAGE.margin + 434, y, usable - 434, 32, "Inscricao estadual", data.recipient.stateRegistration); y += 38;
  };

  const totals = () => {
    const usable = PAGE.width - PAGE.margin * 2; const width = usable / 7;
    doc.font("Helvetica-Bold").fontSize(6).text("CALCULO DO IMPOSTO", PAGE.margin, y); y += 8;
    [["Base ICMS", data.totals.taxBase], ["Valor ICMS", data.totals.icms], ["ICMS deson.", data.totals.icmsExempt], ["FCP", data.totals.fcp], ["Produtos", data.totals.products], ["Frete", data.totals.freight], ["Seguro", data.totals.insurance], ["Desconto", data.totals.discount], ["II", data.totals.ii], ["IPI", data.totals.ipi], ["PIS", data.totals.pis], ["COFINS", data.totals.cofins], ["Outros", data.totals.other], ["Valor da NF-e", data.totals.invoice]].forEach(([label, value], index) => box(doc, PAGE.margin + (index % 7) * width, y + Math.floor(index / 7) * 29, width, 29, label, value, { bold: index === 13, align: "right" }));
    y += 64;
  };

  const tableHeader = () => {
    const columns = [36, 184, 38, 26, 30, 28, 50, 55, 50, 50];
    const labels = ["CODIGO", "DESCRICAO DOS PRODUTOS / SERVICOS", "NCM", "CST", "CFOP", "UN", "QUANT.", "V. UNIT.", "V. TOTAL", "V. ICMS"];
    doc.font("Helvetica-Bold").fontSize(5.3).fillColor(colors.ink); let x = PAGE.margin;
    labels.forEach((label, index) => { doc.rect(x, y, columns[index], 18).fillAndStroke(colors.fill, colors.line); doc.fillColor(colors.ink).text(label, x + 2, y + 5, { width: columns[index] - 4, align: index > 5 ? "right" : "left", lineBreak: false }); x += columns[index]; });
    y += 18;
  };

  header(); totals();
  doc.font("Helvetica-Bold").fontSize(6).text("DADOS DOS PRODUTOS / SERVICOS", PAGE.margin, y); y += 8; tableHeader();
  const columns = [36, 184, 38, 26, 30, 28, 50, 55, 50, 50];
  for (const item of data.items) {
    const height = Math.max(23, Math.ceil(doc.heightOfString(item.description, { width: columns[1] - 4, lineGap: 0 })) + 7);
    if (y + height > PAGE.height - 48) { pageFooter(doc, page); header(); doc.font("Helvetica-Bold").fontSize(6).text("CONTINUACAO DOS PRODUTOS / SERVICOS", PAGE.margin, y); y += 8; tableHeader(); }
    const values = [item.code, item.description, item.ncm, item.cst, item.cfop, item.unit, item.quantity, item.unitValue, item.total, item.icms]; let x = PAGE.margin;
    doc.font("Helvetica").fontSize(5.5).fillColor(colors.ink);
    values.forEach((value, index) => { doc.rect(x, y, columns[index], height).stroke(colors.line); doc.text(value, x + 2, y + 4, { width: columns[index] - 4, height: height - 6, align: index > 5 ? "right" : "left", ellipsis: true }); x += columns[index]; });
    y += height;
  }
  if (data.additionalInfo) {
    if (y + 62 > PAGE.height - 40) { pageFooter(doc, page); header(); }
    y += 7; box(doc, PAGE.margin, y, PAGE.width - PAGE.margin * 2, 54, "Dados adicionais / Informacoes complementares", data.additionalInfo, { size: 6.2 });
  }
  pageFooter(doc, page); doc.end();
  return result;
}
