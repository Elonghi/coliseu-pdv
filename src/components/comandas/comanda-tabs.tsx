import { Tabs } from "@/components/ui";

export type ComandaTab = "board" | "cadastro" | "qrcodes" | "cardapio" | "configuracoes" | "auditoria";

/* Abas da área de comandas. O balcão vê só a primeira; o administrador vê o cadastro, os QR Codes, o cardápio, as configurações e a auditoria. */
export function ComandaTabs({ active, isAdmin }: { active: ComandaTab; isAdmin: boolean }) {
  const items = [
    { key: "board", href: "/admin/comandas", label: "Comandas" },
    ...(isAdmin ? [
      { key: "cadastro", href: "/admin/comandas/cadastro", label: "Cadastro" },
      { key: "qrcodes", href: "/admin/comandas/qrcodes", label: "QR Codes" },
      { key: "cardapio", href: "/admin/comandas/cardapio", label: "Cardápio do celular" },
      { key: "configuracoes", href: "/admin/comandas/configuracoes", label: "Configurações" },
      { key: "auditoria", href: "/admin/comandas/auditoria", label: "Auditoria" },
    ] : []),
  ];
  if (items.length === 1) return null;
  return <Tabs label="Áreas das comandas" items={items.map((item) => ({ href: item.href, label: item.label, active: item.key === active }))}/>;
}
