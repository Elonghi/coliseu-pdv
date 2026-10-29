import type { Tone } from "@/components/ui";

export const purchaseStatus: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  SENT: { label: "Enviado", tone: "info" },
  PARTIAL: { label: "Recebido parcial", tone: "warn" },
  RECEIVED: { label: "Recebido", tone: "ok" },
  CANCELED: { label: "Cancelado", tone: "danger" },
};
