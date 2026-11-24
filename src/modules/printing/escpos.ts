import { codePages, encodeText, type CodePage } from "./code-pages";

/* Gerador de comandos ESC/POS. O servidor monta os bytes e o agente local só os repassa à impressora, então o layout
 * muda com o deploy do sistema, sem atualizar o agente de cada caixa. */
export type PrinterProfile = {
  /** Caracteres por linha na fonte normal: 48 nas térmicas de 80 mm, 32 nas de 58 mm. */
  columns: number;
  codePage: CodePage;
  /** Avança o papel e aciona a guilhotina no fim. */
  cut: boolean;
};

export const defaultPrinterProfile: PrinterProfile = { columns: 48, codePage: "CP860", cut: true };

const ESC = 0x1b;
const GS = 0x1d;

export type Align = "left" | "center" | "right";

export class EscPos {
  private readonly bytes: number[] = [];

  constructor(readonly profile: PrinterProfile) {
    this.raw(ESC, 0x40); // reinicia a impressora (fonte, alinhamento e estilos voltam ao padrão)
    this.raw(ESC, 0x74, codePages[profile.codePage].command);
  }

  raw(...values: number[]) {
    this.bytes.push(...values);
    return this;
  }

  align(value: Align) {
    return this.raw(ESC, 0x61, value === "left" ? 0 : value === "center" ? 1 : 2);
  }

  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Multiplicador de largura e altura (1 a 8). Com largura 2, cabem metade das colunas. */
  size(width = 1, height = 1) {
    const clamp = (value: number) => Math.min(8, Math.max(1, Math.trunc(value))) - 1;
    return this.raw(GS, 0x21, (clamp(width) << 4) | clamp(height));
  }

  text(value: string) {
    this.bytes.push(...encodeText(value, this.profile.codePage));
    return this;
  }

  line(value = "") {
    return this.text(value).raw(0x0a);
  }

  /** Quebra o texto em linhas de até `width` caracteres, sem cortar palavras quando possível. */
  wrapped(value: string, width = this.profile.columns) {
    for (const part of wrap(value, width)) this.line(part);
    return this;
  }

  /** Texto à esquerda e valor encostado à direita na mesma linha; se não couber, o valor desce para a linha seguinte. */
  pair(left: string, right: string, width = this.profile.columns) {
    if (left.length + right.length + 1 <= width) return this.line(left + right.padStart(width - left.length));
    return this.wrapped(left, width).line(right.padStart(width));
  }

  rule(char = "-") {
    return this.line(char.repeat(this.profile.columns));
  }

  feed(lines = 1) {
    return this.raw(ESC, 0x64, Math.min(255, Math.max(0, lines)));
  }

  /** Fim do documento: avança até a guilhotina e corta (corte parcial), ou só avança o papel se a impressora não corta. */
  finish() {
    if (this.profile.cut) return this.raw(GS, 0x56, 66, 3);
    return this.feed(5);
  }

  toBuffer() {
    return Buffer.from(this.bytes);
  }
}

export function wrap(value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!current) current = word;
      else if (current.length + 1 + word.length <= width) current += ` ${word}`;
      else { lines.push(current); current = word; }
      while (current.length > width) { lines.push(current.slice(0, width)); current = current.slice(width); }
    }
    lines.push(current);
  }
  return lines;
}
