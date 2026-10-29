export type SearchQuery = Record<string, string | string[] | undefined>;

/** Monta um link preservando os filtros atuais; `null` remove um parâmetro e a página volta à primeira. */
export function queryHref(pathname: string, query: SearchQuery, patch: Record<string, string | null | undefined> = {}) {
  const merged: SearchQuery = { ...query };
  for (const [key, value] of Object.entries(patch)) merged[key] = value ?? undefined;
  if (!("page" in patch)) delete merged.page;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    for (const item of Array.isArray(value) ? value : [value]) if (item) params.append(key, item);
  }
  const text = params.toString();
  return text ? `${pathname}?${text}` : pathname;
}

/** Data corrente no fuso da loja no formato AAAA-MM-DD. */
export function todayInSaoPaulo(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
