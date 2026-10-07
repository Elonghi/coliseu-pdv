export function calculateDiscount(grossCents: number, discountBps: number) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new Error("Valor bruto inválido");
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10_000) throw new Error("Desconto inválido");
  return Math.floor((grossCents * discountBps + 5_000) / 10_000);
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function parseMoney(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw new Error("Valor monetário inválido");
  return Math.round(number * 100);
}

export function saleNumber(id: number) { return `VEN-${String(id).padStart(6, "0")}`; }
