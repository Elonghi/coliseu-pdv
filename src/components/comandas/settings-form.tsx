"use client";
import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { GEOLOCATION_BLOCKED_BY_SERVER, geolocationAllowedByPolicy } from "@/lib/geolocation-policy";
import { saveSettingsAction } from "@/modules/comandas/actions";

type Settings = { enabled: boolean; requireLocation: boolean; latitude: number | null; longitude: number | null; radiusMeters: number };

/* Liga os pedidos pelo celular e define onde a loja fica. "Usar minha localização" preenche a posição com a do aparelho (faça na loja). */
export function SettingsForm({ settings }: { settings: Settings }) {
  const [latitude, setLatitude] = useState(settings.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(settings.longitude?.toString() ?? "");
  const [status, setStatus] = useState("");

  // Chegou por navegação interna e o navegador manteve a política da tela anterior (sem localização): recarrega uma vez para valer a desta tela.
  useEffect(() => {
    const key = "coliseu:geo-reload";
    try {
      if (geolocationAllowedByPolicy() !== false) { window.sessionStorage.removeItem(key); return; }
      if (window.sessionStorage.getItem(key) !== "1") { window.sessionStorage.setItem(key, "1"); window.location.reload(); return; }
    } catch { /* sem armazenamento local: só avisa */ }
    queueMicrotask(() => setStatus(GEOLOCATION_BLOCKED_BY_SERVER));
  }, []);

  const locate = () => {
    if (geolocationAllowedByPolicy() === false) { setStatus(GEOLOCATION_BLOCKED_BY_SERVER); return; }
    if (!navigator.geolocation) { setStatus("Este navegador não informa a localização."); return; }
    setStatus("Buscando a localização…");
    navigator.geolocation.getCurrentPosition(
      (position) => { setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6)); setStatus(`Localização preenchida (precisão de cerca de ${Math.round(position.coords.accuracy)} m). Salve para confirmar.`); },
      () => setStatus("Não foi possível obter a localização. Permita o acesso no navegador ou digite as coordenadas."),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return <ActionForm action={saveSettingsAction} submitLabel="Salvar configurações" className="grid gap-5">
    <label className="switch"><input type="checkbox" name="enabled" defaultChecked={settings.enabled}/><span>Receber pedidos pelo celular (QR Code das comandas)</span></label>
    <label className="switch"><input type="checkbox" name="requireLocation" defaultChecked={settings.requireLocation}/><span>Exigir localização do cliente (barra pedido feito de longe)</span></label>
    <fieldset className="grid gap-3 sm:grid-cols-3">
      <legend className="label">Onde fica a loja</legend>
      <label className="label">Latitude<input className="field" name="latitude" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="-23.550520"/></label>
      <label className="label">Longitude<input className="field" name="longitude" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="-46.633308"/></label>
      <label className="label">Raio permitido (metros)<input className="field" name="radiusMeters" type="number" min={20} max={2000} step={10} defaultValue={settings.radiusMeters}/></label>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3"><button type="button" className="btn btn-ghost btn-sm" onClick={locate}><LocateFixed size={15}/>Usar minha localização atual</button><span className="field-hint" role="status">{status}</span></div>
    </fieldset>
  </ActionForm>;
}
