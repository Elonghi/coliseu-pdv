/* Barreira contra pedido feito de longe: o celular informa onde está e o servidor confere a distância até a loja.
 * É um freio, não uma garantia: a posição vem do aparelho, e quem sabe mexer nele consegue falsificá-la. Por isso toda
 * tentativa (liberada ou barrada) fica na auditoria, com a posição, a precisão e a distância calculada. */

export type LocationReading = { latitude: number; longitude: number; accuracyMeters: number | null };
/** `denied`: a pessoa recusou a permissão (ou o aparelho não consegue localizar). `missing`: o aparelho não enviou posição alguma. */
export type LocationInput = { denied: true } | { latitude: number; longitude: number; accuracyMeters?: number | null } | null | undefined;
export type StoreLocation = { enabled: boolean; requireLocation: boolean; latitude: number | null; longitude: number | null; radiusMeters: number };

export type LocationVerdict =
  | { ok: true; distanceMeters: number | null; reading: LocationReading | null }
  | { ok: false; code: "LOCATION_DENIED" | "LOCATION_MISSING" | "LOCATION_INACCURATE" | "LOCATION_OUTSIDE" | "LOCATION_NOT_CONFIGURED"; message: string; distanceMeters: number | null; reading: LocationReading | null };

/** Precisão pior que isto (por exemplo, posição aproximada por IP no computador) não prova que a pessoa está na loja. */
export const MAX_ACCURACY_METERS = 500;
/** Parte da imprecisão do aparelho que é perdoada na conta da distância. */
const ACCURACY_ALLOWANCE_METERS = 100;
const EARTH_RADIUS_METERS = 6_371_000;

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h))));
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function evaluateLocation(settings: StoreLocation, input: LocationInput): LocationVerdict {
  if (!settings.requireLocation) return { ok: true, distanceMeters: null, reading: null };
  if (settings.latitude === null || settings.longitude === null) {
    return { ok: false, code: "LOCATION_NOT_CONFIGURED", message: "A loja ainda não definiu a localização para receber pedidos.", distanceMeters: null, reading: null };
  }
  if (input && "denied" in input) {
    return { ok: false, code: "LOCATION_DENIED", message: "Para pedir pelo celular é preciso permitir a localização. Ative nas configurações do navegador e tente de novo.", distanceMeters: null, reading: null };
  }
  if (!input || !finite(input.latitude) || !finite(input.longitude) || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) {
    return { ok: false, code: "LOCATION_MISSING", message: "Não foi possível saber onde você está. Permita a localização e tente de novo.", distanceMeters: null, reading: null };
  }
  const accuracy = finite(input.accuracyMeters) && input.accuracyMeters >= 0 ? input.accuracyMeters : null;
  const reading = { latitude: input.latitude, longitude: input.longitude, accuracyMeters: accuracy };
  const distance = distanceMeters(reading, { latitude: settings.latitude, longitude: settings.longitude });
  if (accuracy !== null && accuracy > MAX_ACCURACY_METERS) {
    return { ok: false, code: "LOCATION_INACCURATE", message: "A localização do seu aparelho está imprecisa. Ative o GPS (localização precisa) e tente de novo.", distanceMeters: distance, reading };
  }
  const allowance = Math.min(accuracy ?? 0, ACCURACY_ALLOWANCE_METERS);
  if (distance - allowance > settings.radiusMeters) {
    return { ok: false, code: "LOCATION_OUTSIDE", message: "Você parece estar longe da loja. Os pedidos pela comanda só funcionam dentro do estabelecimento.", distanceMeters: distance, reading };
  }
  return { ok: true, distanceMeters: distance, reading };
}
