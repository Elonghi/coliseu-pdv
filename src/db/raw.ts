import { Pool } from "pg";

/* Conexão direta com o banco, sem loja nem lojista. Use só onde o escopo ainda não existe (por exemplo, ao descobrir
 * a loja da sessão). Todo o resto do código usa o `pool` de "@/db", que aplica o escopo da requisição. */
const globalForDb = globalThis as unknown as { coliseuPool?: Pool };
export const rawPool = globalForDb.coliseuPool ?? new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://coliseu:coliseu@localhost:55432/coliseu", max: 20 });
if (process.env.NODE_ENV !== "production") globalForDb.coliseuPool = rawPool;
