"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, ShieldCheck } from "lucide-react";
import { GEOLOCATION_BLOCKED_BY_SERVER, geolocationAllowedByPolicy } from "@/lib/geolocation-policy";
import { formatMoney } from "@/lib/money";

type MenuItem = { id: string; name: string; priceCents: number; category: string; maxQuantity: number };
type AccountItem = { name: string; quantity: number; unitPriceCents: number; canceled: boolean };
type AccountOrder = { id: string; status: "NEW" | "DELIVERED" | "CANCELED"; createdAt: string; items: AccountItem[] };
type Account = { orders: AccountOrder[]; totalCents: number };
type Snapshot = { playerFirstName: string; menu: MenuItem[]; account: Account };
type Phase = "intro" | "working" | "blocked" | "ready" | "closed";
type Place = { denied: true } | { latitude: number; longitude: number; accuracyMeters: number } | null | "policy";

const statusText = { NEW: "Recebido", DELIVERED: "Entregue", CANCELED: "Cancelado" } as const;

/** Pede a posição ao aparelho. Qualquer falha (recusa, sem GPS, tempo esgotado) vira "denied": o servidor explica o que fazer. */
function readPlace(): Promise<Place> {
  return new Promise((resolve) => {
    // Se o próprio servidor ou um proxy bloqueia a localização nesta página, o navegador nem chega a perguntar: avisa o motivo real.
    if (geolocationAllowedByPolicy() === false) { resolve("policy"); return; }
    if (!navigator.geolocation) { resolve({ denied: true }); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy }),
      () => resolve({ denied: true }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 20_000 },
    );
  });
}

const deviceInfo = () => ({
  screen: `${window.screen.width}x${window.screen.height}`, language: navigator.language,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, touch: navigator.maxTouchPoints > 0,
});

export function OrderClient({ token, storeName, number, requireLocation }: { token: string; storeName: string; number: number; requireLocation: boolean }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<"menu" | "account">("menu");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  /** Identifica este envio: um toque duplo ou uma rede ruim reenviam o mesmo id e o servidor não duplica o pedido. */
  const [requestId, setRequestId] = useState<string | null>(null);
  const base = `/api/pedidos/${token}`;

  const call = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(`${base}/${path}`, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(json.error ?? "Não foi possível concluir. Tente de novo."), { code: json.code as string | undefined });
    return json;
  }, [base]);

  const fail = useCallback((error: unknown) => {
    const code = (error as { code?: string }).code;
    setMessage(error instanceof Error ? error.message : "Não foi possível concluir. Tente de novo.");
    setPhase(code === "CLOSED" ? "closed" : "blocked");
  }, []);

  const enter = useCallback(async () => {
    setPhase("working"); setMessage("");
    try {
      const location = requireLocation ? await readPlace() : null;
      if (location === "policy") throw Object.assign(new Error(GEOLOCATION_BLOCKED_BY_SERVER), { code: "POLICY" });
      const json = await call("entrar", { location, device: deviceInfo() });
      setData({ playerFirstName: json.playerFirstName, menu: json.menu, account: json.account });
      setPhase("ready");
    } catch (error) { fail(error); }
  }, [call, fail, requireLocation]);

  // A conta e o cardápio se atualizam sozinhos (o balcão pode entregar, cancelar ou esgotar um item).
  useEffect(() => {
    if (phase !== "ready") return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const json = await call("conta");
        if (json.state === "CLOSED") { setMessage("Sua comanda foi fechada. Obrigado pela visita!"); setPhase("closed"); return; }
        setData((current) => current && { ...current, menu: json.menu, account: json.account });
      } catch { /* sem rede: mantém o que está na tela */ }
    }, 10_000);
    return () => clearInterval(timer);
  }, [phase, call]);

  const byId = useMemo(() => new Map((data?.menu ?? []).map((item) => [item.id, item])), [data]);
  const lines = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ item: byId.get(id), quantity })).filter((line): line is { item: MenuItem; quantity: number } => Boolean(line.item));
  const cartCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = lines.reduce((sum, line) => sum + line.item.priceCents * line.quantity, 0);
  const grouped = useMemo(() => { const map = new Map<string, MenuItem[]>(); for (const item of data?.menu ?? []) map.set(item.category, [...(map.get(item.category) ?? []), item]); return [...map]; }, [data]);

  const change = (id: string, delta: number, max: number) => { setCart((current) => ({ ...current, [id]: Math.max(0, Math.min(max, (current[id] ?? 0) + delta)) })); setRequestId(null); };

  async function submit() {
    setSending(true); setMessage("");
    try {
      const attempt = requestId ?? crypto.randomUUID();
      setRequestId(attempt);
      const location = requireLocation ? await readPlace() : null;
      if (location === "policy") throw Object.assign(new Error(GEOLOCATION_BLOCKED_BY_SERVER), { code: "POLICY" });
      const json = await call("pedido", { requestId: attempt, items: lines.map((line) => ({ productId: line.item.id, quantity: line.quantity })), note: note.trim() || undefined, location, device: deviceInfo() });
      setData((current) => current && { ...current, menu: json.menu, account: json.account });
      setCart({}); setNote(""); setReview(false); setRequestId(null); setSent(true); setTab("account");
      setTimeout(() => setSent(false), 4000);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "PRODUCT_UNAVAILABLE" || code === "INSUFFICIENT_STOCK") {
        setMessage((error as Error).message); setReview(false); setRequestId(null);
        try { const json = await call("conta"); if (json.state === "OPEN") setData((current) => current && { ...current, menu: json.menu, account: json.account }); } catch { /* mantém a tela */ }
      } else fail(error);
    } finally { setSending(false); }
  }

  if (phase === "closed") return <main className="cmd-shell"><section className="cmd-card cmd-notice"><p className="cmd-store">{storeName}</p><h1>Comanda {number} fechada</h1><p>{message || "Esta comanda foi fechada. Peça ao atendente para abri-la de novo."}</p></section></main>;

  if (phase !== "ready") return <main className="cmd-shell"><section className="cmd-card">
    <p className="cmd-store">{storeName}</p>
    <h1>Comanda {number}</h1>
    {phase === "blocked" && <p className="cmd-alert" role="alert">{message}</p>}
    <p>Peça direto do seu celular: o pedido vai para o balcão e entra na conta desta comanda. O pagamento é feito no balcão.</p>
    {requireLocation && <div className="cmd-privacy"><ShieldCheck size={18}/><p>Para pedir, o sistema confirma que você está na loja usando a <b>localização do seu celular</b>. Registramos horário, aparelho e localização dos pedidos por 90 dias, apenas para a segurança da loja.</p></div>}
    <button type="button" className="cmd-primary" onClick={enter} disabled={phase === "working"}>{phase === "working" ? "Verificando…" : phase === "blocked" ? "Tentar de novo" : requireLocation ? "Permitir localização e continuar" : "Continuar"}</button>
  </section></main>;

  const account = data!.account;
  const activeOrders = account.orders.filter((order) => order.status !== "CANCELED").length;
  return <main className="cmd-shell has-bar">
    <header className="cmd-head"><div><p className="cmd-store">{storeName}</p><h1>Comanda {number}</h1></div><p>Olá, <b>{data!.playerFirstName}</b></p></header>
    <nav className="cmd-tabs" aria-label="Seções"><button type="button" className={tab === "menu" ? "is-active" : ""} onClick={() => setTab("menu")}>Cardápio</button><button type="button" className={tab === "account" ? "is-active" : ""} onClick={() => setTab("account")}>Minha conta{activeOrders > 0 && <span>{activeOrders}</span>}</button></nav>
    {sent && <p className="cmd-ok" role="status"><Check size={16}/>Pedido enviado! O balcão já recebeu.</p>}
    {message && <p className="cmd-alert" role="alert">{message}</p>}

    {tab === "menu" && (grouped.length ? grouped.map(([category, items]) => <section key={category} className="cmd-group"><h2>{category}</h2>
      {items.map((item) => { const quantity = cart[item.id] ?? 0; return <article key={item.id} className="cmd-item">
        <div><b>{item.name}</b><span>{formatMoney(item.priceCents)}</span></div>
        {item.maxQuantity > 0 ? <div className="cmd-stepper">
          <button type="button" onClick={() => change(item.id, -1, item.maxQuantity)} disabled={quantity === 0} aria-label={`Tirar ${item.name}`}><Minus size={16}/></button>
          <output aria-label={`Quantidade de ${item.name}`}>{quantity}</output>
          <button type="button" onClick={() => change(item.id, 1, item.maxQuantity)} disabled={quantity >= item.maxQuantity} aria-label={`Adicionar ${item.name}`}><Plus size={16}/></button>
        </div> : <em>Esgotado</em>}
      </article>; })}
    </section>) : <p className="cmd-empty">O cardápio ainda não tem itens. Chame o atendente.</p>)}

    {tab === "account" && <section className="cmd-group"><h2>Seus pedidos</h2>
      {account.orders.length === 0 && <p className="cmd-empty">Você ainda não pediu nada.</p>}
      {[...account.orders].reverse().map((order) => <article key={order.id} className={`cmd-order is-${order.status.toLowerCase()}`}>
        <header><span>{new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span><b>{statusText[order.status]}</b></header>
        <ul>{order.items.map((item, index) => <li key={index} className={item.canceled ? "is-canceled" : ""}><span>{item.quantity}× {item.name}</span><span>{formatMoney(item.unitPriceCents * item.quantity)}</span></li>)}</ul>
      </article>)}
      <p className="cmd-total"><span>Total da conta</span><strong>{formatMoney(account.totalCents)}</strong></p>
      <p className="cmd-hint">Para pagar, vá ao balcão e informe o número da sua comanda.</p>
    </section>}

    {tab === "menu" && cartCount > 0 && !review && <div className="cmd-bar"><button type="button" className="cmd-primary" onClick={() => setReview(true)}>Revisar pedido · {cartCount} {cartCount === 1 ? "item" : "itens"} · {formatMoney(cartTotal)}</button></div>}

    {review && <div className="cmd-sheet" role="dialog" aria-modal="true" aria-label="Revisar pedido"><div className="cmd-sheet-body">
      <h2>Seu pedido</h2>
      <ul>{lines.map(({ item, quantity }) => <li key={item.id}><span>{quantity}× {item.name}</span><span>{formatMoney(item.priceCents * quantity)}</span></li>)}</ul>
      <label>Observação (opcional)<input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: sem gelo"/></label>
      <p className="cmd-total"><span>Total do pedido</span><strong>{formatMoney(cartTotal)}</strong></p>
      <div className="cmd-sheet-actions"><button type="button" className="cmd-secondary" onClick={() => setReview(false)} disabled={sending}>Voltar</button><button type="button" className="cmd-primary" onClick={submit} disabled={sending}>{sending ? "Enviando…" : "Enviar pedido"}</button></div>
    </div></div>}
  </main>;
}
