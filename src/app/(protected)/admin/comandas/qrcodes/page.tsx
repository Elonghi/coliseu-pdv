/* O SVG injetado vem do bwip-js a partir do nosso próprio link assinado; não há conteúdo de terceiros aqui. */
import { headers } from "next/headers";
import bwipjs from "bwip-js";
import { Store } from "lucide-react";
import { ComandaTabs } from "@/components/comandas/comanda-tabs";
import { PrintButton } from "@/components/comandas/print-button";
import { EmptyState, PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/modules/auth/session";
import { getComandaSettings } from "@/modules/comandas/service";
import { comandaLink, publicBaseUrl } from "@/modules/comandas/token";

export const dynamic = "force-dynamic";

export default async function ComandaQrPage() {
  const user = await requireUser("ADMIN");
  const header = <PageHeader eyebrow="Operação" title="QR Codes das comandas" description="Imprima e recorte: cada QR Code abre a tela de pedidos da comanda dele."/>;
  if (user.consolidated) return <div className="section-gap">{header}<ComandaTabs active="qrcodes" isAdmin/><EmptyState icon={Store} title="Escolha uma loja" description="Os QR Codes são de cada loja. Escolha a loja no seletor do menu."/></div>;
  const requestHeaders = await headers();
  const base = publicBaseUrl(requestHeaders);
  const settings = await getComandaSettings();
  const storeName = user.stores.find((store) => store.id === user.activeStoreId)?.name ?? "";
  const comandas = (await pool.query<{ id: string; number: number; token_version: number }>("SELECT id,number,token_version FROM comandas WHERE active ORDER BY number")).rows;

  let cards: { id: string; number: number; svg: string; link: string }[] = [];
  let problem: string | null = null;
  try {
    cards = comandas.map((comanda) => {
      const link = comandaLink(comanda.id, comanda.token_version, requestHeaders);
      return { id: comanda.id, number: comanda.number, link, svg: bwipjs.toSVG({ bcid: "qrcode", text: link, eclevel: "M", scale: 4, backgroundcolor: "FFFFFF" }) };
    });
  } catch (error) { problem = error instanceof AppError ? error.message : "Não foi possível gerar os QR Codes."; }

  return <div className="section-gap qr-page">
    <div className="no-print">{header}<ComandaTabs active="qrcodes" isAdmin/></div>
    {problem && <p className="notice-error no-print">{problem}</p>}
    {!problem && !comandas.length && <EmptyState title="Nenhuma comanda ativa" description="Cadastre as comandas primeiro."/>}
    {!problem && cards.length > 0 && <>
      <div className="no-print qr-toolbar">
        <PrintButton label="Imprimir QR Codes"/>
        <p className="field-hint">Os links apontam para <b>{base || "o endereço do sistema"}</b>.{!process.env.APP_URL && " Defina APP_URL no ambiente para fixar o endereço nos QR Codes."} {!settings.enabled && <b>Os pedidos pelo celular estão desligados: ligue em Configurações antes de usar.</b>}</p>
      </div>
      <section className="qr-sheet" aria-label="QR Codes para imprimir">{cards.map((card) => <article key={card.id} className="qr-card">
        <p className="qr-store">{storeName}</p>
        <p className="qr-number"><small>COMANDA</small>{card.number}</p>
        <div className="qr-code" dangerouslySetInnerHTML={{ __html: card.svg }}/>
        <p className="qr-hint">Escaneie para pedir pelo celular</p>
      </article>)}</section>
    </>}
  </div>;
}
