import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const schema = z.object({
  enabled: z.boolean(),
  environment: z.enum(["PRODUCTION", "HOMOLOGATION"]),
  cnpj: z.string().regex(/^[A-Z0-9]{14}$/),
  ufCode: z.number().int().min(11).max(99),
  certificatePath: z.string().optional(),
  certificateBase64: z.string().optional(),
  certificatePassword: z.string().min(1),
  endpoint: z.string().url(),
  intervalMinutes: z.number().int().min(60).max(1440),
  maxBatches: z.number().int().min(1).max(100),
});

export type SefazConfig = z.infer<typeof schema>;

const normalizeCnpj = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function isSefazEnabled() {
  return process.env.SEFAZ_ENABLED === "true";
}

export function getSefazConfig(): SefazConfig {
  const environment = process.env.SEFAZ_ENVIRONMENT === "homologation" ? "HOMOLOGATION" : "PRODUCTION";
  const endpoint = process.env.SEFAZ_ENDPOINT ?? (environment === "PRODUCTION"
    ? "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
    : "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx");
  const parsed = schema.safeParse({
    enabled: isSefazEnabled(),
    environment,
    cnpj: normalizeCnpj(process.env.SEFAZ_CNPJ ?? ""),
    ufCode: Number(process.env.SEFAZ_UF_CODE),
    certificatePath: process.env.SEFAZ_CERTIFICATE_PATH || undefined,
    certificateBase64: process.env.SEFAZ_CERTIFICATE_BASE64 || undefined,
    certificatePassword: process.env.SEFAZ_CERTIFICATE_PASSWORD ?? "",
    endpoint,
    intervalMinutes: Number(process.env.SEFAZ_SYNC_INTERVAL_MINUTES ?? 60),
    maxBatches: Number(process.env.SEFAZ_MAX_BATCHES_PER_SYNC ?? 20),
  });
  if (!parsed.success) throw new AppError(`Configuração da SEFAZ inválida: ${parsed.error.issues[0]?.message ?? "verifique as variáveis de ambiente"}.`, 503, "SEFAZ_CONFIG_INVALID");
  if (!parsed.data.certificatePath && !parsed.data.certificateBase64) throw new AppError("Informe SEFAZ_CERTIFICATE_PATH ou SEFAZ_CERTIFICATE_BASE64.", 503, "SEFAZ_CERTIFICATE_MISSING");
  return parsed.data;
}

export async function loadA1Certificate(config: SefazConfig) {
  try {
    const certificate = config.certificateBase64
      ? Buffer.from(config.certificateBase64.replace(/\s/g, ""), "base64")
      : await readFile(config.certificatePath!);
    if (!certificate.length) throw new Error("arquivo vazio");
    return certificate;
  } catch (error) {
    throw new AppError(`Não foi possível carregar o certificado A1: ${error instanceof Error ? error.message : "erro desconhecido"}.`, 503, "SEFAZ_CERTIFICATE_INVALID");
  }
}

export function sefazPublicConfig() {
  const cnpj = normalizeCnpj(process.env.SEFAZ_CNPJ ?? "");
  return {
    enabled: isSefazEnabled(),
    environment: process.env.SEFAZ_ENVIRONMENT === "homologation" ? "HOMOLOGATION" : "PRODUCTION",
    cnpj: cnpj.length === 14 ? cnpj : null,
    ufCode: Number(process.env.SEFAZ_UF_CODE) || null,
    certificateConfigured: Boolean(process.env.SEFAZ_CERTIFICATE_PATH || process.env.SEFAZ_CERTIFICATE_BASE64),
    intervalMinutes: Number(process.env.SEFAZ_SYNC_INTERVAL_MINUTES ?? 60),
  };
}
