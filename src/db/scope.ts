import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";

/* Escopo de dados de uma requisição: de qual lojista (conta) e de qual loja os dados são.
 *   storeId  loja ativa; vazio na visão "Todas as lojas", onde só se lê.
 *   storeIds lojas que a requisição pode enxergar (a ativa, ou todas as do usuário na visão consolidada).
 * O banco recebe isso em app.account_id, app.store_id e app.store_ids. As colunas account_id/store_id têm como padrão
 * o valor da sessão (funções app_current_account / app_current_store), então a gravação cai na loja certa sem o código
 * precisar informar. Sem loja ativa e com mais de uma loja, a gravação falha de propósito em vez de misturar dados. */
export type DbScope = { accountId: string | null; storeId: string | null; storeIds: string[]; platform?: boolean };

const explicit = new AsyncLocalStorage<DbScope>();

/** Roda `run` com um escopo definido à mão: usado pelo worker (uma sincronização por loja), por scripts e por testes. */
export function runWithScope<T>(scope: DbScope, run: () => Promise<T>) {
  return explicit.run(scope, run);
}

let requestScope: Promise<typeof import("@/modules/auth/request-scope")> | undefined;

/** O escopo definido à mão tem prioridade; em requisição do Next, vem da sessão e do cookie da loja; fora disso, não há escopo. */
export async function currentScope(): Promise<DbScope | null> {
  const given = explicit.getStore();
  if (given) return given;
  if (!process.env.NEXT_RUNTIME || process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    requestScope ??= import("@/modules/auth/request-scope");
    return await (await requestScope).resolveRequestScope();
  } catch {
    return null;
  }
}

type Queryable = Pick<PoolClient, "query">;
const settings = (scope: DbScope) => [scope.accountId ?? "", scope.storeId ?? "", scope.storeIds.join(","), scope.platform ? "true" : ""];

async function applyScope(client: Queryable, scope: DbScope) {
  await client.query("SELECT set_config('app.account_id',$1,false),set_config('app.store_id',$2,false),set_config('app.store_ids',$3,false),set_config('app.platform',$4,false)", settings(scope));
}
const clearScope = (client: Queryable) => applyScope(client, { accountId: null, storeId: null, storeIds: [] });

/* Devolve ao pool uma conexão sempre limpa. Se não for possível limpar (por exemplo, transação esquecida em erro),
 * a conexão é descartada, para o escopo de uma requisição nunca vazar para a próxima. */
async function releaseClean(client: PoolClient, release: (error?: boolean | Error) => void, error?: boolean | Error) {
  try { await clearScope(client); release(error); } catch { release(true); }
}

export function scopedPool(raw: Pool): Pool {
  return new Proxy(raw, {
    get(target, property) {
      if (property === "query") {
        return async (...args: unknown[]) => {
          const run = target.query.bind(target) as (...values: unknown[]) => Promise<unknown>;
          const scope = await currentScope();
          if (!scope) return run(...args);
          const client = await target.connect();
          const release = client.release.bind(client);
          try {
            await applyScope(client, scope);
            return await (client.query.bind(client) as (...values: unknown[]) => Promise<unknown>)(...args);
          } finally {
            await releaseClean(client, release);
          }
        };
      }
      if (property === "connect") {
        return async (...args: unknown[]) => {
          const connect = target.connect.bind(target) as (...values: unknown[]) => Promise<PoolClient>;
          if (args.length) return connect(...args);
          const client = await connect();
          const scope = await currentScope();
          if (!scope) return client;
          const release = client.release.bind(client);
          try { await applyScope(client, scope); } catch (error) { release(true); throw error; }
          client.release = (error?: boolean | Error) => { void releaseClean(client, release, error); };
          return client;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
