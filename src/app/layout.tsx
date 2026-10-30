import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa";
import "./globals.css";

const appUrl = process.env.APP_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Coliseu PDV", template: "%s | Coliseu PDV" },
  description: "Frente de loja e gestão completa para lojas de TCG.",
  applicationName: "Coliseu PDV",
  appleWebApp: { capable: true, title: "Coliseu", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: "#172744", colorScheme: "light" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR" data-scroll-behavior="smooth"><body>{children}<PwaRegister/></body></html>; }
