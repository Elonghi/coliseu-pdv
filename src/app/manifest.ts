import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Coliseu PDV & Gestão",
    short_name: "Coliseu",
    description: "Frente de caixa e gestão completa para lojas de TCG.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f5f7fb",
    theme_color: "#172744",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Abrir PDV", short_name: "PDV", description: "Frente de caixa", url: "/pdv", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Painel de gestão", short_name: "Gestão", description: "Dashboard e cadastros", url: "/admin", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
