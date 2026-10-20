import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight, Banknote, BarChart3, Boxes, ClipboardCheck, CreditCard, FileInput,
  FileText, History, LayoutDashboard, Package, ShieldCheck, ShoppingBag, Tags, Truck,
  UserRound, Users, WalletCards,
} from "lucide-react";
import { permissions, type Permission } from "@/modules/auth/permissions";

export type AdminNavigationLink = readonly [href: string, label: string, icon: LucideIcon, permission: Permission | null];
export type AdminNavigationGroup = { id: string; label: string; links: readonly AdminNavigationLink[] };

export const adminNavigationGroups = [
  { id: "overview", label: "Visão geral", links: [["/admin", "Dashboard", LayoutDashboard, permissions.DASHBOARD_VIEW]] },
  { id: "operation", label: "Operação", links: [["/admin/sales", "Vendas", ShoppingBag, permissions.SALES_VIEW], ["/admin/cash", "Caixas", Banknote, permissions.CASH_MANAGE], ["/admin/stock", "Estoque", BarChart3, permissions.STOCK_MANAGE], ["/admin/inventory", "Inventários", ClipboardCheck, permissions.INVENTORY_MANAGE], ["/admin/finance", "Financeiro", WalletCards, permissions.FINANCE_MANAGE], ["/admin/purchases", "Compras", Truck, permissions.PURCHASE_MANAGE]] },
  { id: "catalog", label: "Catálogo", links: [["/admin/products", "Produtos", Package, permissions.CATALOG_MANAGE], ["/admin/labels", "Etiquetas", Tags, permissions.CATALOG_MANAGE], ["/admin/categories", "Categorias", Boxes, permissions.CATALOG_MANAGE], ["/admin/payment-methods", "Pagamentos", CreditCard, permissions.CATALOG_MANAGE]] },
  { id: "relationship", label: "Relacionamento", links: [["/admin/players", "Jogadores", UserRound, permissions.PLAYERS_MANAGE], ["/admin/users", "Usuários", Users, permissions.USERS_MANAGE]] },
  { id: "fiscal", label: "Fiscal", links: [["/admin/fiscal", "Notas fiscais", FileText, permissions.FISCAL_MANAGE], ["/admin/fiscal/movements", "Entradas e saídas", ArrowLeftRight, permissions.FISCAL_MANAGE], ["/admin/fiscal/integration", "Importação e SEFAZ", FileInput, permissions.FISCAL_MANAGE]] },
  { id: "security", label: "Segurança", links: [["/admin/audit", "Auditoria", History, permissions.AUDIT_VIEW], ["/security", "Minha segurança", ShieldCheck, null]] },
] as const satisfies readonly AdminNavigationGroup[];
