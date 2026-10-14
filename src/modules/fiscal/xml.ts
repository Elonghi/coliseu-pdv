import { XMLParser, XMLValidator } from "fast-xml-parser";

type XmlValue = string | number | boolean | null | XmlObject | XmlValue[];
interface XmlObject { [key: string]: XmlValue }

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  trimValues: true,
});

const object = (value: XmlValue | undefined): XmlObject | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as XmlObject : undefined;
const array = (value: XmlValue | undefined): XmlValue[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const string = (value: XmlValue | undefined): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") return string(object(value)?.["#text"]);
  return String(value).trim() || undefined;
};
const integer = (value: XmlValue | undefined) => { const parsed = Number.parseInt(string(value) ?? "", 10); return Number.isFinite(parsed) ? parsed : undefined; };
const date = (value: XmlValue | undefined) => { const parsed = string(value); return parsed && !Number.isNaN(Date.parse(parsed)) ? new Date(parsed) : undefined; };
const dateOnly = (value: XmlValue | undefined) => {
  const parsed = string(value);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return undefined;
  const [year, month, day] = parsed.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day ? parsed : undefined;
};

export function decimalToCents(value: XmlValue | undefined) {
  const raw = string(value);
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return undefined;
  const [whole, fraction = ""] = raw.split(".");
  const base = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  const rounded = Number(fraction[2] ?? "0") >= 5 ? base + 1n : base;
  const result = Number(rounded);
  return Number.isSafeInteger(result) ? result : undefined;
}

export function parseXml(xml: string): XmlObject {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML com DTD ou entidades externas não é aceito.");
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`XML inválido: ${validation.err.msg}.`);
  const parsed = parser.parse(xml) as XmlObject;
  if (!parsed || typeof parsed !== "object") throw new Error("XML da SEFAZ inválido.");
  return parsed;
}

export function findNode(value: XmlValue, name: string): XmlObject | undefined {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findNode(item, name); if (found) return found; }
    return undefined;
  }
  const current = object(value);
  if (!current) return undefined;
  const direct = object(current[name]);
  if (direct) return direct;
  for (const child of Object.values(current)) { const found = findNode(child, name); if (found) return found; }
  return undefined;
}

export type NormalizedInvoice = {
  accessKey: string;
  hasFullXml: boolean;
  status: "AUTHORIZED" | "CANCELED" | "DENIED" | "UNKNOWN";
  issuerCnpjCpf?: string;
  issuerName?: string;
  issuerStateRegistration?: string;
  recipientCnpjCpf?: string;
  recipientName?: string;
  recipientStateRegistration?: string;
  issueAt?: Date;
  authorizationAt?: Date;
  operationType?: number;
  model?: string;
  series?: string;
  number?: string;
  operationNature?: string;
  totalCents?: number;
  protocol?: string;
  xmlVersion?: string;
};

export type NormalizedItem = {
  itemNumber: number;
  productCode?: string;
  ean?: string;
  description: string;
  ncm?: string;
  cfop?: string;
  unit?: string;
  quantity?: string;
  unitValueCents?: number;
  totalCents?: number;
  discountCents?: number;
  freightCents?: number;
  insuranceCents?: number;
  otherCents?: number;
  taxes?: XmlObject;
};

export type NormalizedEvent = {
  accessKey?: string;
  eventType?: string;
  sequence?: number;
  eventAt?: Date;
  protocol?: string;
  statusCode?: string;
  statusMessage?: string;
};

export type NormalizedDuplicate = {
  number?: string;
  dueDate: string;
  amountCents: number;
};

export type NormalizedBilling = {
  invoiceNumber?: string;
  originalCents?: number;
  discountCents?: number;
  netCents?: number;
  duplicates: NormalizedDuplicate[];
};

export type NormalizedDfe = {
  kind: "SUMMARY" | "NFE" | "EVENT" | "UNKNOWN";
  accessKey?: string;
  invoice?: NormalizedInvoice;
  items: NormalizedItem[];
  billing?: NormalizedBilling;
  event?: NormalizedEvent;
  parsed: Record<string, unknown>;
};

function statusFromSituation(value?: string): NormalizedInvoice["status"] {
  return value === "1" ? "AUTHORIZED" : value === "2" ? "DENIED" : value === "3" ? "CANCELED" : "UNKNOWN";
}

function normalizeSummary(root: XmlObject): NormalizedDfe {
  const accessKey = string(root.chNFe);
  if (!accessKey) throw new Error("Resumo de NF-e sem chave de acesso.");
  const invoice: NormalizedInvoice = {
    accessKey,
    hasFullXml: false,
    status: statusFromSituation(string(root.cSitNFe)),
    issuerCnpjCpf: string(root.CNPJ) ?? string(root.CPF),
    issuerName: string(root.xNome),
    issuerStateRegistration: string(root.IE),
    issueAt: date(root.dhEmi),
    operationType: integer(root.tpNF),
    totalCents: decimalToCents(root.vNF),
    protocol: string(root.nProt),
  };
  return { kind: "SUMMARY", accessKey, invoice, items: [], parsed: { invoice } };
}

function normalizeInvoice(root: XmlObject): NormalizedDfe {
  const nfe = object(root.NFe) ?? root;
  const info = object(nfe.infNFe);
  if (!info) throw new Error("NF-e sem grupo infNFe.");
  const protocolInfo = object(object(root.protNFe)?.infProt);
  const ide = object(info.ide) ?? {};
  const emit = object(info.emit) ?? {};
  const dest = object(info.dest) ?? {};
  const totals = object(object(info.total)?.ICMSTot) ?? {};
  const accessKey = (string(info["@_Id"]) ?? string(protocolInfo?.chNFe))?.replace(/^NFe/, "");
  if (!accessKey) throw new Error("NF-e sem chave de acesso.");
  const protocolStatus = string(protocolInfo?.cStat);
  const invoice: NormalizedInvoice = {
    accessKey,
    hasFullXml: true,
    status: protocolStatus === "100" ? "AUTHORIZED" : ["101", "151", "155"].includes(protocolStatus ?? "") ? "CANCELED" : ["110", "301", "302"].includes(protocolStatus ?? "") ? "DENIED" : "UNKNOWN",
    issuerCnpjCpf: string(emit.CNPJ) ?? string(emit.CPF),
    issuerName: string(emit.xNome),
    issuerStateRegistration: string(emit.IE),
    recipientCnpjCpf: string(dest.CNPJ) ?? string(dest.CPF),
    recipientName: string(dest.xNome),
    recipientStateRegistration: string(dest.IE),
    issueAt: date(ide.dhEmi) ?? date(ide.dEmi),
    authorizationAt: date(protocolInfo?.dhRecbto),
    operationType: integer(ide.tpNF),
    model: string(ide.mod),
    series: string(ide.serie),
    number: string(ide.nNF),
    operationNature: string(ide.natOp),
    totalCents: decimalToCents(totals.vNF),
    protocol: string(protocolInfo?.nProt),
    xmlVersion: string(info["@_versao"]) ?? string(root["@_versao"]),
  };
  const items = array(info.det).map((entry, index) => {
    const detail = object(entry) ?? {};
    const product = object(detail.prod) ?? {};
    return {
      itemNumber: integer(detail["@_nItem"]) ?? index + 1,
      productCode: string(product.cProd),
      ean: string(product.cEAN),
      description: string(product.xProd) ?? "Item sem descrição",
      ncm: string(product.NCM),
      cfop: string(product.CFOP),
      unit: string(product.uCom),
      quantity: string(product.qCom),
      unitValueCents: decimalToCents(product.vUnCom),
      totalCents: decimalToCents(product.vProd),
      discountCents: decimalToCents(product.vDesc),
      freightCents: decimalToCents(product.vFrete),
      insuranceCents: decimalToCents(product.vSeg),
      otherCents: decimalToCents(product.vOutro),
      taxes: object(detail.imposto),
    } satisfies NormalizedItem;
  });
  const billingNode = object(info.cobr);
  const invoiceBilling = object(billingNode?.fat);
  const duplicateNodes = array(billingNode?.dup);
  const duplicates = duplicateNodes.map((entry, index) => {
    const duplicate = object(entry) ?? {};
    const dueDate = dateOnly(duplicate.dVenc);
    const amountCents = decimalToCents(duplicate.vDup);
    if (!dueDate) throw new Error(`Duplicata ${index + 1} sem data de vencimento válida.`);
    if (!amountCents || amountCents <= 0) throw new Error(`Duplicata ${index + 1} sem valor válido.`);
    return { number: string(duplicate.nDup), dueDate, amountCents } satisfies NormalizedDuplicate;
  });
  const billing = billingNode ? {
    invoiceNumber: string(invoiceBilling?.nFat),
    originalCents: decimalToCents(invoiceBilling?.vOrig),
    discountCents: decimalToCents(invoiceBilling?.vDesc),
    netCents: decimalToCents(invoiceBilling?.vLiq),
    duplicates,
  } satisfies NormalizedBilling : undefined;
  return { kind: "NFE", accessKey, invoice, items, billing, parsed: { invoice, items, ...(billing ? { billing } : {}) } };
}

function normalizeEvent(root: XmlObject): NormalizedDfe {
  const eventInfo = object(object(root.evento)?.infEvento) ?? findNode(root, "infEvento") ?? {};
  const returnInfo = object(object(root.retEvento)?.infEvento) ?? {};
  const event: NormalizedEvent = {
    accessKey: string(eventInfo.chNFe) ?? string(returnInfo.chNFe),
    eventType: string(eventInfo.tpEvento) ?? string(returnInfo.tpEvento),
    sequence: integer(eventInfo.nSeqEvento) ?? integer(returnInfo.nSeqEvento),
    eventAt: date(eventInfo.dhEvento) ?? date(returnInfo.dhRegEvento),
    protocol: string(returnInfo.nProt),
    statusCode: string(returnInfo.cStat),
    statusMessage: string(returnInfo.xMotivo),
  };
  return { kind: "EVENT", accessKey: event.accessKey, event, items: [], parsed: { event } };
}

function normalizeEventSummary(root: XmlObject): NormalizedDfe {
  const event: NormalizedEvent = {
    accessKey: string(root.chNFe),
    eventType: string(root.tpEvento),
    sequence: integer(root.nSeqEvento),
    eventAt: date(root.dhEvento) ?? date(root.dhRecbto),
    protocol: string(root.nProt),
    statusMessage: string(root.xEvento),
  };
  return { kind: "EVENT", accessKey: event.accessKey, event, items: [], parsed: { event } };
}

export function normalizeDfeXml(xml: string): NormalizedDfe {
  const parsed = parseXml(xml);
  const summary = findNode(parsed, "resNFe");
  if (summary) return normalizeSummary(summary);
  const invoiceProcess = findNode(parsed, "nfeProc");
  if (invoiceProcess) return normalizeInvoice(invoiceProcess);
  const invoice = findNode(parsed, "NFe");
  if (invoice) return normalizeInvoice(invoice);
  const eventSummary = findNode(parsed, "resEvento");
  if (eventSummary) return normalizeEventSummary(eventSummary);
  const event = findNode(parsed, "procEventoNFe") ?? findNode(parsed, "evento");
  if (event) return normalizeEvent(event);
  return { kind: "UNKNOWN", items: [], parsed: { rootElements: Object.keys(parsed) } };
}

export function manifestationLabel(eventType?: string) {
  return ({ "210200": "CONFIRMED", "210210": "AWARE", "210220": "UNKNOWN_OPERATION", "210240": "NOT_PERFORMED" } as Record<string, string>)[eventType ?? ""];
}
