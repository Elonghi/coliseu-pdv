import { afterEach, describe, expect, it } from "vitest";
import { clientIp, describeUserAgent, requestInfo } from "@/modules/comandas/request-info";

const saved = process.env.TRUSTED_PROXY_HOPS;
afterEach(() => { if (saved === undefined) delete process.env.TRUSTED_PROXY_HOPS; else process.env.TRUSTED_PROXY_HOPS = saved; });

describe("IP do cliente atrás do proxy", () => {
  it("usa o último IP do X-Forwarded-For (o que o proxy de confiança viu), não o que o cliente escreveu", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("com mais de um proxy de confiança, conta a partir do fim", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.4, 203.0.113.9" }))).toBe("198.51.100.4");
  });
  it("guarda o IPv4 mapeado em IPv6 (::ffff:a.b.c.d) como IPv4 puro", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "::ffff:203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "::FFFF:198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "2804:14d:5c80:1234::1" }))).toBe("2804:14d:5c80:1234::1"); // IPv6 verdadeiro não muda
  });
  it("cai para X-Real-IP e, sem nenhum, devolve nulo", () => {
    expect(clientIp(new Headers({ "x-real-ip": "192.0.2.10" }))).toBe("192.0.2.10");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("aparelho pelo User-Agent", () => {
  it("reconhece iPhone sem inventar o modelo (o iOS não informa)", () => {
    const info = describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1");
    expect(info).toMatchObject({ os: "iOS", browser: "Safari", mobile: true, model: null });
  });
  it("lê o modelo quando o Android informa e ignora o 'K' do Chrome reduzido", () => {
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36")).toMatchObject({ os: "Android", browser: "Chrome", model: "SM-S918B" });
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36").model).toBeNull();
  });
  it("monta o registro da requisição com IP, aparelho e o que o navegador contou", () => {
    const info = requestInfo(new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/124.0 Safari/537.36", "x-forwarded-for": "203.0.113.9" }), { screen: "390x844", language: "pt-BR" });
    expect(info.ip).toBe("203.0.113.9");
    expect(info.deviceInfo).toMatchObject({ os: "Windows", browser: "Chrome", mobile: false, screen: "390x844", language: "pt-BR", forwardedFor: "203.0.113.9" });
  });
});
