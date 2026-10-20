import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.APP_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Coliseu PDV", template: "%s | Coliseu PDV" },
  description: "Frente de loja e gestão completa para lojas de TCG.",
  applicationName: "Coliseu PDV",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR" data-scroll-behavior="smooth"><body>{children}</body></html>; }
