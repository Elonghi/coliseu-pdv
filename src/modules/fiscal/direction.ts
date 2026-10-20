export type FiscalDirection = "ENTRY" | "EXIT" | "OTHER";

const normalizeDocument = (value?: string | null) => value?.replace(/\D/g, "") ?? "";

export function fiscalDirection(companyCnpj: string, issuerDocument?: string | null, recipientDocument?: string | null): FiscalDirection {
  const company = normalizeDocument(companyCnpj);
  const issuer = normalizeDocument(issuerDocument);
  const recipient = normalizeDocument(recipientDocument);
  if (recipient === company) return "ENTRY";
  if (issuer === company) return "EXIT";
  // O resumo resNFe distribuído ao destinatário não informa o CNPJ do destinatário.
  if (!recipient && issuer && issuer !== company) return "ENTRY";
  return "OTHER";
}

export function fiscalDirectionLabel(direction: FiscalDirection) {
  return direction === "ENTRY" ? "Entrada" : direction === "EXIT" ? "Saída" : "Outra operação";
}

export function formatFiscalDocument(value?: string | null) {
  const document = normalizeDocument(value);
  if (document.length === 14) return document.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5");
  if (document.length === 11) return document.replace(/(.{3})(.{3})(.{3})(.{2})/, "$1.$2.$3-$4");
  return value || "—";
}
