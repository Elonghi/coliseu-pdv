/* O navegador decide se uma página pode pedir a localização pelo cabeçalho Permissions-Policy da página carregada POR INTEIRO.
 * Navegar clicando em links do painel (navegação interna do Next) não recarrega a página, então vale o cabeçalho da primeira
 * tela, mesmo que a tela nova tenha outro. Aqui a localização só é liberada em /pedidos/* e na configuração das comandas
 * (next.config.ts); quem chega nelas por navegação interna precisa de uma recarga. Devolve null quando o navegador não informa. */
export function geolocationAllowedByPolicy(): boolean | null {
  const doc = document as unknown as { permissionsPolicy?: { allowsFeature(feature: string): boolean }; featurePolicy?: { allowsFeature(feature: string): boolean } };
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  return policy ? policy.allowsFeature("geolocation") : null;
}

export const GEOLOCATION_BLOCKED_BY_SERVER = "A localização está bloqueada nesta página por uma configuração do servidor (Permissions-Policy). Recarregue a página e, se continuar, avise quem cuida do sistema.";
