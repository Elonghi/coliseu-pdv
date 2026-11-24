import { headers } from "next/headers";
import { describeForPage } from "@/modules/comandas/public";
import { OrderClient } from "./order-client";

export const dynamic = "force-dynamic";

function Notice({ title, text, store }: { title: string; text: string; store?: string }) {
  return <main className="cmd-shell"><section className="cmd-card cmd-notice">
    {store && <p className="cmd-store">{store}</p>}
    <h1>{title}</h1><p>{text}</p>
  </section></main>;
}

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await describeForPage(token, await headers());
  switch (state.kind) {
    case "invalid": return <Notice title="Link inválido" text="Não foi possível abrir esta comanda. Escaneie o QR Code da comanda de novo."/>;
    case "busy": return <Notice title="Muitas tentativas" text="Aguarde um minuto e escaneie o QR Code de novo."/>;
    case "disabled": return <Notice store={state.storeName} title="Pedidos pelo celular indisponíveis" text="Esta loja ainda não ativou os pedidos pela comanda. Faça o pedido no balcão."/>;
    case "closed": return <Notice store={state.storeName} title={`Comanda ${state.number} fechada`} text="Esta comanda ainda não foi aberta. Peça ao atendente para abri-la no balcão e escaneie o QR Code de novo."/>;
    default: return <OrderClient token={token} storeName={state.storeName} number={state.number} requireLocation={state.requireLocation}/>;
  }
}
