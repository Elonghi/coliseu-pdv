"use client";
import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Modal } from "@/components/modal";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** O service worker só é registrado em produção: em desenvolvimento ele serviria arquivos antigos do hot reload. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => { navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined); };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

/** Botão "Instalar app": usa o aviso nativo do navegador (Chrome/Edge/Android) ou ensina o caminho no iPhone/iPad. */
export function InstallAppButton({ className = "btn btn-ghost" }: { className?: string }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    });
    const onPrompt = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPromptEvent); };
    const onInstalled = () => { setPromptEvent(null); setInstalled(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return null;
  if (promptEvent) return <button type="button" className={className} onClick={async () => { await promptEvent.prompt(); await promptEvent.userChoice; setPromptEvent(null); }}><Download size={17}/><span>Instalar app</span></button>;
  if (!ios) return null;
  return <Modal trigger={<><Download size={17}/><span>Instalar app</span></>} triggerClassName={className} size="sm" title="Instalar no iPhone ou iPad" description="No Safari, o aplicativo é adicionado pela tela de compartilhamento.">
    <ol className="grid gap-3 text-sm">
      <li>1. Toque em <b>Compartilhar</b> <Share size={15} className="inline"/> na barra do Safari.</li>
      <li>2. Escolha <b>Adicionar à Tela de Início</b>.</li>
      <li>3. Confirme em <b>Adicionar</b>. O Coliseon passa a abrir em tela cheia, como um aplicativo.</li>
    </ol>
  </Modal>;
}
