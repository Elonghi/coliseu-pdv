import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Coliseu PDV", template: "%s | Coliseu PDV" },
  description: "Frente de loja e gestão completa para lojas de TCG.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR" data-scroll-behavior="smooth"><body>{children}</body></html>; }
