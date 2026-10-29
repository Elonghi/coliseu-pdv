export const onlyDigits = (value: string) => value.replace(/\D/g, "");

export function maskCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14);
  let out = d.slice(0, 2);
  if (d.length > 2) out += `.${d.slice(2, 5)}`;
  if (d.length > 5) out += `.${d.slice(5, 8)}`;
  if (d.length > 8) out += `/${d.slice(8, 12)}`;
  if (d.length > 12) out += `-${d.slice(12)}`;
  return out;
}

/** Celular/fixo com DDD e 0800/0300; ignora o +55 quando o número vem colado com código do país. */
export function maskPhone(value: string) {
  let d = onlyDigits(value);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (/^0[38]00/.test(d)) return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const masks = { cnpj: maskCnpj, phone: maskPhone };
export type MaskKind = keyof typeof masks;
