import type { ComandaEventType } from "./audit";

export const eventLabel: Record<ComandaEventType, string> = {
  COMANDA_CREATED: "Comandas cadastradas", COMANDA_UPDATED: "Comanda editada", COMANDA_QR_ROTATED: "QR Code trocado", SETTINGS_UPDATED: "Configurações alteradas",
  SESSION_OPENED: "Comanda aberta", SESSION_CANCELED: "Comanda cancelada", SESSION_CLOSED: "Conta cobrada (comanda fechada)", PLAYER_COMPLETED: "Cadastro do cliente completado",
  LINK_OPENED: "Cliente abriu o link", LINK_BLOCKED: "Acesso barrado", ORDER_CREATED: "Pedido do cliente", ORDER_BLOCKED: "Pedido barrado", COUNTER_ORDER_CREATED: "Item lançado pelo balcão",
  ORDER_DELIVERED: "Pedido entregue", ORDER_CANCELED: "Pedido cancelado", ITEM_CANCELED: "Item cancelado",
};

/** Motivos de bloqueio, como aparecem em `details.reason`. */
export const reasonLabel: Record<string, string> = {
  DISABLED: "Pedidos por comanda desligados", CLOSED: "Comanda fechada", NO_DEVICE: "Aparelho sem sessão", RATE_LIMITED: "Excesso de tentativas",
  LOCATION_DENIED: "Localização recusada", LOCATION_MISSING: "Sem localização", LOCATION_INACCURATE: "Localização imprecisa", LOCATION_OUTSIDE: "Fora do raio da loja",
  LOCATION_NOT_CONFIGURED: "Loja sem localização definida", PRODUCT_UNAVAILABLE: "Produto indisponível", INSUFFICIENT_STOCK: "Estoque insuficiente",
};

export const orderStatusLabel = { NEW: "Novo", DELIVERED: "Entregue", CANCELED: "Cancelado" } as const;
