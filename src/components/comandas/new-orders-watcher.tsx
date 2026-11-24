"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Volume2, VolumeX } from "lucide-react";

type Incoming = { id: string; number: number; player: string; items: { name: string; quantity: number }[] };

/* Fica de olho nos pedidos que chegam pelo celular: a cada poucos segundos consulta, avisa com som e atualiza a tela. */
export function NewOrdersWatcher({ initialIds }: { initialIds: string[] }) {
  const router = useRouter();
  const known = useRef(new Set(initialIds));
  const [fresh, setFresh] = useState<Incoming[]>([]);
  const [sound, setSound] = useState(true);

  useEffect(() => { queueMicrotask(() => { try { setSound(window.localStorage.getItem("coliseu:comanda-sound") !== "off"); } catch { /* padrão: com som */ } }); }, []);

  const beep = useCallback(() => {
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.frequency.value = 880; gain.gain.value = 0.08;
      oscillator.start(); oscillator.stop(context.currentTime + 0.35);
      oscillator.onended = () => void context.close();
    } catch { /* o navegador pode bloquear o som antes do primeiro clique */ }
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/comandas/novos", { cache: "no-store" });
        if (!response.ok || stopped) return;
        const { orders } = (await response.json()) as { orders: Incoming[] };
        const added = orders.filter((order) => !known.current.has(order.id));
        for (const order of orders) known.current.add(order.id);
        if (added.length) { setFresh(added); if (sound) beep(); router.refresh(); }
      } catch { /* sem rede: tenta de novo no próximo ciclo */ }
    };
    const timer = setInterval(tick, 6000);
    return () => { stopped = true; clearInterval(timer); };
  }, [router, sound, beep]);

  const toggle = () => setSound((current) => { const next = !current; try { window.localStorage.setItem("coliseu:comanda-sound", next ? "on" : "off"); } catch { /* sem armazenamento local */ } return next; });

  return <div className="orders-watch">
    {fresh.length > 0 && <div className="orders-alert" role="alert">
      <BellRing size={18}/>
      <div><b>{fresh.length === 1 ? "Novo pedido" : `${fresh.length} novos pedidos`}</b>
        <ul>{fresh.slice(0, 4).map((order) => <li key={order.id}>Comanda {order.number} · {order.player}: {order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}</li>)}</ul>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFresh([])}>Ok</button>
    </div>}
    <button type="button" className="btn btn-ghost btn-sm" onClick={toggle} aria-pressed={sound} title="Som de novo pedido">{sound ? <Volume2 size={15}/> : <VolumeX size={15}/>}{sound ? "Som ligado" : "Som desligado"}</button>
  </div>;
}
