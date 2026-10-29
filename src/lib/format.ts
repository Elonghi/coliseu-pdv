const timeZone = "America/Sao_Paulo";

type DateInput = Date | string | null | undefined;

export const formatDate = (value: DateInput) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone }) : "—";
export const formatTime = (value: DateInput) => value ? new Date(value).toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }) : "";
export const formatDateTime = (value: DateInput) => value ? `${formatDate(value)} ${formatTime(value)}` : "—";

/** Colunas DATE chegam do `pg` como Date ou, quando convertidas no SQL, como AAAA-MM-DD (sem hora: fixamos o meio-dia para não recuar um dia por fuso). */
export const formatDueDate = (value: Date | string | null | undefined) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
};

export const formatSigned = (value: number) => `${value > 0 ? "+" : ""}${value}`;
