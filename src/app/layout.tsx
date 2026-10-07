import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Coliseu PDV", description: "Frente de loja e gestão" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
