import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";

/* Comandas são operadas por quem opera o caixa. As telas de cadastro, QR Codes, cardápio, configurações e auditoria exigem administrador (cada uma confere). */
export default async function ComandasLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(permissions.CASH_MANAGE);
  return children;
}
