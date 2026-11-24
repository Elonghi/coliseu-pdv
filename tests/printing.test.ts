import { describe, expect, it } from "vitest";
import { encodeText } from "@/modules/printing/code-pages";
import { EscPos, wrap, type PrinterProfile } from "@/modules/printing/escpos";
import { saleReceipt, testPage, type SaleReceipt } from "@/modules/printing/receipt";
import { createAgentToken, hashAgentToken, parseAgentToken, sameHash } from "@/modules/printing/token";

const profile: PrinterProfile = { columns: 48, codePage: "CP860", cut: true };
const ESC = 0x1b;
const GS = 0x1d;

/** Linhas de texto do documento, sem os comandos ESC/GS (para conferir layout e largura). */
function textLines(data: Buffer, page = profile.codePage) {
  const bytes = [...data];
  const out: number[] = [];
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index];
    if (byte === ESC) { index += bytes[index + 1] === 0x40 ? 1 : 2; continue; }
    if (byte === GS) { index += bytes[index + 1] === 0x56 ? 3 : 2; continue; }
    out.push(byte);
  }
  const high = (page === "CP860" ? "ÇüéâãàÁçêÊèÍÔìÃÂÉÀÈôõòÚùÌÕÜ¢£Ù₧ÓáíóúñÑªº¿Ò" : "");
  return Buffer.from(out).toString("latin1").replace(/[\x80-\xff]/g, (char) => high[char.charCodeAt(0) - 0x80] ?? "?").split("\n");
}

const sale: SaleReceipt = {
  storeName: "Coliseu TCG",
  storeCnpj: "12345678000190",
  number: "VEN-000042",
  createdAt: new Date("2026-11-24T17:32:00Z"),
  operatorName: "Operadora de Teste",
  canceled: false,
  items: [
    { name: "Booster Coleção Ação e Aventura edição especial de colecionador", sku: "BST-1", unitCode: "UN", quantity: 2, unitPriceCents: 3990, discountBps: 1000, grossCents: 7980, discountCents: 798, totalCents: 7182 },
    { name: "Água mineral", sku: "AG-1", unitCode: "UN", quantity: 1, unitPriceCents: 450, discountBps: 0, grossCents: 450, discountCents: 0, totalCents: 450 },
  ],
  subtotalCents: 8430,
  discountCents: 798,
  totalCents: 7632,
  payments: [{ name: "Dinheiro", code: "CASH", amountAppliedCents: 7632, amountReceivedCents: 10000, changeCents: 2368, playerName: null, dueDate: null }],
};

describe("páginas de código da impressora térmica", () => {
  it("converte os acentos do português para os bytes da CP860", () => {
    expect(encodeText("ç ã õ é Ç Ã Õ É ê ô à á í ó ú", "CP860")).toEqual([0x87, 0x20, 0x84, 0x20, 0x94, 0x20, 0x82, 0x20, 0x80, 0x20, 0x8e, 0x20, 0x99, 0x20, 0x90, 0x20, 0x88, 0x20, 0x93, 0x20, 0x85, 0x20, 0xa0, 0x20, 0xa1, 0x20, 0xa2, 0x20, 0xa3]);
  });

  it("usa a tabela escolhida: o mesmo ã vira bytes diferentes em CP850 e WPC1252", () => {
    expect(encodeText("ã", "CP850")).toEqual([0xc6]);
    expect(encodeText("ã", "WPC1252")).toEqual([0xe3]);
  });

  it("sem tabela de acentos, tira o acento em vez de imprimir lixo; o que não tem equivalente vira ?", () => {
    expect(Buffer.from(encodeText("Não é ação — “ok”…", "ASCII")).toString("latin1")).toBe("Nao e acao - \"ok\"...");
    expect(encodeText("日", "CP860")).toEqual([0x3f]);
  });

  it("descarta caracteres de controle para o texto não virar comando da impressora", () => {
    expect(encodeText("a\x1b@b\tc", "CP860")).toEqual([0x61, 0x40, 0x62, 0x20, 0x63]);
  });
});

describe("gerador ESC/POS", () => {
  it("começa reiniciando a impressora e escolhendo a página de código", () => {
    expect([...new EscPos(profile).toBuffer()]).toEqual([ESC, 0x40, ESC, 0x74, 3]);
  });

  it("encosta o valor à direita na largura da bobina", () => {
    const lines = textLines(new EscPos(profile).pair("Total", "R$ 10,00").toBuffer());
    expect(lines[0]).toHaveLength(48);
    expect(lines[0]).toBe(`Total${"R$ 10,00".padStart(43)}`);
  });

  it("quebra texto longo sem cortar palavras", () => {
    expect(wrap("um dois três quatro", 9)).toEqual(["um dois", "três", "quatro"]);
    expect(wrap("abcdefghijkl", 5)).toEqual(["abcde", "fghij", "kl"]);
  });

  it("corta o papel no fim só quando a impressora tem guilhotina", () => {
    expect([...new EscPos(profile).finish().toBuffer()].slice(-4)).toEqual([GS, 0x56, 66, 3]);
    expect([...new EscPos({ ...profile, cut: false }).finish().toBuffer()].slice(-3)).toEqual([ESC, 0x64, 5]);
  });
});

describe("comprovante de venda", () => {
  const data = saleReceipt(sale, profile);
  const lines = textLines(data);

  it("nenhuma linha passa da largura da bobina", () => {
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(48);
  });

  it("traz loja, CNPJ, número, itens, descontos, total, troco e o aviso de que não é documento fiscal", () => {
    const text = lines.join("\n");
    expect(text).toContain("COLISEU TCG");
    expect(text).toContain("CNPJ 12.345.678/0001-90");
    expect(text).toContain("Venda VEN-000042");
    expect(text).toContain("24/11/2026 14:32");
    expect(text).toContain("Água mineral");
    expect(text).toMatch(/2 UN x 39,90 +79,80/);
    expect(text).toMatch(/Desconto 10% +-7,98/);
    expect(text).toMatch(/TOTAL +R\$ 76,32/);
    expect(text).toMatch(/Troco +23,68/);
    expect(text).toContain("NÃO É DOCUMENTO FISCAL");
    expect(text).not.toContain("2ª via");
  });

  it("marca segunda via e venda cancelada", () => {
    const text = textLines(saleReceipt({ ...sale, canceled: true, reprintedAt: new Date("2026-11-24T18:00:00Z") }, profile)).join("\n");
    expect(text).toContain("VENDA CANCELADA");
    expect(text).toContain("2ª via impressa em 24/11/2026 15:00");
  });

  it("se ajusta a bobinas de 58 mm (32 colunas)", () => {
    for (const line of textLines(saleReceipt(sale, { ...profile, columns: 32 }))) expect(line.length, line).toBeLessThanOrEqual(32);
  });

  it("termina com o corte", () => {
    expect([...data].slice(-4)).toEqual([GS, 0x56, 66, 3]);
  });

  it("a página de teste tem a régua do tamanho exato da linha", () => {
    expect(textLines(testPage({ terminalName: "Caixa 1", storeName: "Loja", at: new Date() }, profile))).toContain("123456789012345678901234567890123456789012345678");
  });
});

describe("token do agente", () => {
  const store = "0b7c2f5e-1d3a-4c8e-9f60-2a4b6c8d0e1f";
  const terminal = "5f1e2d3c-4b5a-4968-8776-655443322110";

  it("carrega loja e impressora e só o hash é guardado", () => {
    const { token, hash } = createAgentToken(store, terminal);
    expect(parseAgentToken(token)).toEqual({ storeId: store, terminalId: terminal });
    expect(hash).toBe(hashAgentToken(token));
    expect(hash).not.toContain(token.split(".")[3]);
    expect(sameHash(hash, token)).toBe(true);
    expect(sameHash(hash, `${token}x`)).toBe(false);
  });

  it("recusa formatos estranhos", () => {
    for (const value of ["", "abc", `cpa1.${store}.${terminal}`, `cpa1.${store}.nao-e-uuid.${"x".repeat(43)}`, `xyz.${store}.${terminal}.${"x".repeat(43)}`, `cpa1.${store}.${terminal}.curto`]) expect(parseAgentToken(value)).toBeNull();
  });
});
