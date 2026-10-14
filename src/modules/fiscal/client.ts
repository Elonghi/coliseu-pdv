import https from "node:https";
import { gunzipSync } from "node:zlib";
import { AppError } from "@/lib/errors";
import { findNode, parseXml } from "./xml";
import { loadA1Certificate, type SefazConfig } from "./config";

type XmlObject = Record<string, unknown>;
export type DistributedDocument = { nsu: string; schema: string; xml: string };
export type DistributionResponse = { statusCode: string; statusMessage: string; lastNsu: string; maxNsu: string; documents: DistributedDocument[] };

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[character]!);
const padNsu = (value: string) => value.replace(/\D/g, "").padStart(15, "0").slice(-15);
const text = (value: unknown): string => typeof value === "object" && value !== null ? text((value as XmlObject)["#text"]) : String(value ?? "").trim();
const list = (value: unknown) => value === undefined ? [] : Array.isArray(value) ? value : [value];

export function buildDistributionEnvelope(config: Pick<SefazConfig, "environment" | "ufCode" | "cnpj">, lastNsu: string) {
  const tpAmb = config.environment === "PRODUCTION" ? "1" : "2";
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${config.ufCode}</cUFAutor>
          <CNPJ>${escapeXml(config.cnpj)}</CNPJ>
          <distNSU><ultNSU>${padNsu(lastNsu)}</ultNSU></distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

async function soapRequest(config: SefazConfig, body: string) {
  const certificate = await loadA1Certificate(config);
  const url = new URL(config.endpoint);
  return new Promise<string>((resolve, reject) => {
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      pfx: certificate,
      passphrase: config.certificatePassword,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      timeout: 30_000,
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8; action=\"http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse\"",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "Coliseu-PDV/1.0",
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > 10 * 1024 * 1024) request.destroy(new Error("Resposta da SEFAZ excedeu 10 MB."));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        const content = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) reject(new AppError(`SEFAZ respondeu HTTP ${response.statusCode ?? "desconhecido"}.`, 502, "SEFAZ_HTTP_ERROR"));
        else resolve(content);
      });
    });
    request.on("timeout", () => request.destroy(new Error("Tempo limite de conexão com a SEFAZ.")));
    request.on("error", (error) => reject(new AppError(`Falha na comunicação com a SEFAZ: ${error.message}`, 502, "SEFAZ_CONNECTION_ERROR")));
    request.end(body);
  });
}

export function parseDistributionResponse(responseXml: string): DistributionResponse {
  const parsed = parseXml(responseXml);
  const fault = findNode(parsed, "Fault");
  if (fault) throw new AppError(`Falha SOAP da SEFAZ: ${text(fault.Reason) || text(fault.faultstring) || "resposta inválida"}.`, 502, "SEFAZ_SOAP_FAULT");
  const result = findNode(parsed, "retDistDFeInt");
  if (!result) throw new AppError("Resposta da SEFAZ não contém retDistDFeInt.", 502, "SEFAZ_INVALID_RESPONSE");
  const batch = findNode(result, "loteDistDFeInt");
  const documents = list(batch?.docZip).map((entry) => {
    const document = entry as XmlObject;
    const nsu = padNsu(text(document["@_NSU"]));
    const schema = text(document["@_schema"]);
    const compressed = Buffer.from(text(document["#text"]), "base64");
    if (!schema || !compressed.length) throw new AppError("Documento compactado inválido retornado pela SEFAZ.", 502, "SEFAZ_INVALID_DOCUMENT");
    const xml = gunzipSync(compressed, { maxOutputLength: 20 * 1024 * 1024 }).toString("utf8");
    return { nsu, schema, xml };
  });
  return {
    statusCode: text(result.cStat),
    statusMessage: text(result.xMotivo),
    lastNsu: padNsu(text(result.ultNSU)),
    maxNsu: padNsu(text(result.maxNSU)),
    documents,
  };
}

export async function distributeDfe(config: SefazConfig, lastNsu: string) {
  return parseDistributionResponse(await soapRequest(config, buildDistributionEnvelope(config, lastNsu)));
}
