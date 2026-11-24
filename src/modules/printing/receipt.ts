import { codePages } from "./code-pages";
import { EscPos, type PrinterProfile } from "./escpos";

export type ReceiptItem = { name: string; sku: string; unitCode: string; quantity: number; unitPriceCents: number; discountBps: number; grossCents: number; discountCents: number; totalCents: number };
export type ReceiptPayment = { name: string; code: string; amountAppliedCents: number; amountReceivedCents: number | null; changeCents: number; playerName: string | null; dueDate: string | null };
export type SaleReceipt = {
  storeName: string;
  storeCnpj: string | null;
  number: string;
  createdAt: Date;
  operatorName: string;
  canceled: boolean;
  items: ReceiptItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  payments: ReceiptPayment[];
  /** Data da reimpressão; vazio na primeira via. */
  reprintedAt?: Date | null;
};

const TIME_ZONE = "America/Sao_Paulo";
export const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = (value: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value).replace(",", "");
const isoDate = (value: string) => value.length >= 10 ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : value;
const percent = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const cnpj = (value: string) => value.length === 14 ? `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-${value.slice(12)}` : value;

/** Comprovante de venda (não fiscal) no formato da bobina térmica. */
export function saleReceipt(sale: SaleReceipt, profile: PrinterProfile) {
  const out = new EscPos(profile);
  const half = Math.floor(profile.columns / 2);

  out.align("center").bold(true).size(2, 2).wrapped(sale.storeName.toUpperCase(), half).size().bold(false);
  if (sale.storeCnpj) out.line(`CNPJ ${cnpj(sale.storeCnpj)}`);
  out.line().bold(true).line("COMPROVANTE DE VENDA").bold(false).align("left").rule();
  out.pair(`Venda ${sale.number}`, dateTime(sale.createdAt));
  out.wrapped(`Operador: ${sale.operatorName}`);
  out.rule();

  for (const item of sale.items) {
    out.wrapped(item.name);
    out.pair(`  ${item.quantity} ${item.unitCode} x ${money(item.unitPriceCents)}`, money(item.grossCents));
    if (item.discountCents > 0) out.pair(`  Desconto ${percent(item.discountBps)}`, `-${money(item.discountCents)}`);
  }
  out.rule();
  const units = sale.items.reduce((total, item) => total + item.quantity, 0);
  out.pair(`Subtotal (${units} ${units === 1 ? "item" : "itens"})`, money(sale.subtotalCents));
  if (sale.discountCents > 0) out.pair("Descontos", `-${money(sale.discountCents)}`);
  out.bold(true).size(1, 2).pair("TOTAL", `R$ ${money(sale.totalCents)}`).size().bold(false);
  out.rule();

  for (const payment of sale.payments) {
    out.pair(payment.name, money(payment.amountAppliedCents));
    if (payment.amountReceivedCents !== null && payment.amountReceivedCents !== payment.amountAppliedCents) out.pair("  Recebido", money(payment.amountReceivedCents));
    if (payment.changeCents > 0) out.pair("  Troco", money(payment.changeCents));
    if (payment.playerName) out.wrapped(`  Jogador: ${payment.playerName}`);
    if (payment.dueDate) out.line(`  Vencimento: ${isoDate(payment.dueDate)}`);
  }
  out.rule();

  out.align("center");
  if (sale.canceled) out.bold(true).size(1, 2).line("VENDA CANCELADA").size().bold(false);
  if (sale.reprintedAt) out.line(`2ª via impressa em ${dateTime(sale.reprintedAt)}`);
  out.bold(true).line("NÃO É DOCUMENTO FISCAL").bold(false);
  out.feed(1);
  return out.finish().toBuffer();
}

/** Página de teste: confere acentos, largura da linha e corte de uma impressora recém-cadastrada. */
export function testPage(info: { terminalName: string; storeName: string; at: Date }, profile: PrinterProfile) {
  const out = new EscPos(profile);
  out.align("center").bold(true).size(2, 2).line("TESTE").size().line("Impressão do Coliseu PDV").bold(false);
  out.wrapped(info.terminalName).wrapped(info.storeName).align("left").rule();
  out.line(`Data: ${dateTime(info.at)}`);
  out.line(`Página de código: ${codePages[profile.codePage].label}`);
  out.line(`Colunas: ${profile.columns}`);
  out.line();
  out.wrapped("Acentos: ÁÉÍÓÚ ÂÊÔ ÃÕ À Ç áéíóú âêô ãõ à ç");
  out.line("Régua (deve caber em uma linha):");
  out.line("1234567890".repeat(Math.ceil(profile.columns / 10)).slice(0, profile.columns));
  out.rule();
  out.align("center").wrapped("Se os acentos e a régua saíram certos, esta impressora está pronta.");
  out.feed(1);
  return out.finish().toBuffer();
}
