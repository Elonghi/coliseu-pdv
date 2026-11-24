import { describe, expect, it } from "vitest";
import { distanceMeters, evaluateLocation, type StoreLocation } from "@/modules/comandas/geo";

const store: StoreLocation = { enabled: true, requireLocation: true, latitude: -23.55052, longitude: -46.633308, radiusMeters: 150 };
// ~0,001 grau de latitude ≈ 111 m
const at = (metersNorth: number, accuracyMeters: number | null = 10) => ({ latitude: store.latitude! + metersNorth / 111_195, longitude: store.longitude!, accuracyMeters });

describe("distância até a loja", () => {
  it("calcula distâncias conhecidas", () => {
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 })).toBe(0);
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeGreaterThan(111_000);
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeLessThan(111_400);
    expect(Math.abs(distanceMeters(at(0), at(100)) - 100)).toBeLessThan(3);
  });
});

describe("conferência de localização do celular", () => {
  it("libera quem está dentro do raio e informa a distância", () => {
    const verdict = evaluateLocation(store, at(60));
    expect(verdict.ok).toBe(true);
    expect(verdict.distanceMeters).toBeGreaterThan(55);
    expect(verdict.distanceMeters).toBeLessThan(65);
  });

  it("barra quem está fora do raio, mesmo com boa precisão", () => {
    const verdict = evaluateLocation(store, at(400));
    expect(verdict).toMatchObject({ ok: false, code: "LOCATION_OUTSIDE" });
  });

  it("perdoa parte da imprecisão do aparelho, mas só até um limite", () => {
    expect(evaluateLocation(store, at(220, 80)).ok).toBe(true);   // 220 - 80 = 140 <= 150
    expect(evaluateLocation(store, at(300, 400)).ok).toBe(false); // o perdão máximo é 100 m: 300 - 100 > 150
  });

  it("recusa posição imprecisa demais (ex.: aproximada por IP)", () => {
    expect(evaluateLocation(store, at(0, 2500))).toMatchObject({ ok: false, code: "LOCATION_INACCURATE" });
  });

  it("recusa quando a pessoa negou a permissão ou não enviou posição", () => {
    expect(evaluateLocation(store, { denied: true })).toMatchObject({ ok: false, code: "LOCATION_DENIED" });
    expect(evaluateLocation(store, null)).toMatchObject({ ok: false, code: "LOCATION_MISSING" });
    expect(evaluateLocation(store, undefined)).toMatchObject({ ok: false, code: "LOCATION_MISSING" });
  });

  it("recusa coordenadas inválidas ou fora do mundo", () => {
    expect(evaluateLocation(store, { latitude: Number.NaN, longitude: 0 })).toMatchObject({ ok: false, code: "LOCATION_MISSING" });
    expect(evaluateLocation(store, { latitude: 120, longitude: 0 })).toMatchObject({ ok: false, code: "LOCATION_MISSING" });
    expect(evaluateLocation(store, { latitude: 0, longitude: 400 })).toMatchObject({ ok: false, code: "LOCATION_MISSING" });
  });

  it("loja sem localização cadastrada não consegue conferir ninguém", () => {
    expect(evaluateLocation({ ...store, latitude: null, longitude: null }, at(0))).toMatchObject({ ok: false, code: "LOCATION_NOT_CONFIGURED" });
  });

  it("com a conferência desligada pela loja, não pede nem usa a posição", () => {
    expect(evaluateLocation({ ...store, requireLocation: false }, { denied: true })).toMatchObject({ ok: true, distanceMeters: null });
    expect(evaluateLocation({ ...store, requireLocation: false, latitude: null, longitude: null }, null).ok).toBe(true);
  });
});
