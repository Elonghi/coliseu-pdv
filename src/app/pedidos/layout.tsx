import type { Metadata, Viewport } from "next";

/* Tela pública do cliente (sem login): não deve aparecer em buscadores nem repassar o endereço (que carrega a assinatura da comanda). */
export const metadata: Metadata = { title: "Pedido da comanda", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#172744" };

export default function PublicOrderLayout({ children }: { children: React.ReactNode }) {
  return <div className="cmd-page">{children}</div>;
}
