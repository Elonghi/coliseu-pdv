export const permissions = {
  DASHBOARD_VIEW: "DASHBOARD_VIEW",
  SALES_VIEW: "SALES_VIEW",
  CASH_MANAGE: "CASH_MANAGE",
  FINANCE_MANAGE: "FINANCE_MANAGE",
  STOCK_MANAGE: "STOCK_MANAGE",
  INVENTORY_MANAGE: "INVENTORY_MANAGE",
  PURCHASE_MANAGE: "PURCHASE_MANAGE",
  CATALOG_MANAGE: "CATALOG_MANAGE",
  PLAYERS_MANAGE: "PLAYERS_MANAGE",
  FISCAL_MANAGE: "FISCAL_MANAGE",
  USERS_MANAGE: "USERS_MANAGE",
  AUDIT_VIEW: "AUDIT_VIEW",
} as const;

export type Permission = typeof permissions[keyof typeof permissions];

export const permissionOptions: { code: Permission; label: string }[] = [
  { code: permissions.DASHBOARD_VIEW, label: "Visualizar dashboard" },
  { code: permissions.SALES_VIEW, label: "Consultar as próprias vendas" },
  { code: permissions.CASH_MANAGE, label: "Operar caixa" },
  { code: permissions.FINANCE_MANAGE, label: "Gerenciar financeiro" },
  { code: permissions.STOCK_MANAGE, label: "Ajustar estoque" },
  { code: permissions.INVENTORY_MANAGE, label: "Realizar inventários" },
  { code: permissions.PURCHASE_MANAGE, label: "Gerenciar compras" },
  { code: permissions.CATALOG_MANAGE, label: "Gerenciar catálogo e etiquetas" },
  { code: permissions.PLAYERS_MANAGE, label: "Gerenciar jogadores" },
  { code: permissions.FISCAL_MANAGE, label: "Gerenciar notas e SEFAZ" },
  { code: permissions.USERS_MANAGE, label: "Gerenciar usuários" },
  { code: permissions.AUDIT_VIEW, label: "Consultar auditoria" },
];

export function hasPermission(user: { role: "ADMIN" | "OPERATOR"; permissions: readonly Permission[] }, permission: Permission) {
  return user.role === "ADMIN" || user.permissions.includes(permission);
}
