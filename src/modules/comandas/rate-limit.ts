import { createHash } from "node:crypto";
import { rawPool } from "@/db/raw";

/* Limite de tentativas por janela de tempo, guardado no banco (não depende de Redis nem de memória do processo). A chave é um hash:
 * o IP puro nunca é gravado aqui. A tabela rate_limits é global (sem loja), então a consulta não usa o escopo da requisição. */

export const hashKey = (prefix: string, value: string) => `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 40)}`;

/** Conta mais uma tentativa em `key` e diz se ainda está dentro do limite da janela de `windowSeconds`. */
export async function hit(key: string, limit: number, windowSeconds: number) {
  const result = await rawPool.query<{ hits: number }>(`INSERT INTO rate_limits (key,window_start,hits) VALUES ($1,now(),1)
    ON CONFLICT (key) DO UPDATE SET
      hits=CASE WHEN rate_limits.window_start < now()-make_interval(secs=>$2) THEN 1 ELSE rate_limits.hits+1 END,
      window_start=CASE WHEN rate_limits.window_start < now()-make_interval(secs=>$2) THEN now() ELSE rate_limits.window_start END
    RETURNING hits`, [key, windowSeconds]);
  const hits = result.rows[0].hits;
  if (Math.random() < 0.01) void rawPool.query("DELETE FROM rate_limits WHERE window_start < now()-interval '1 day'").catch(() => undefined);
  return { allowed: hits <= limit, hits };
}
