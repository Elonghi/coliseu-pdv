import { drizzle } from "drizzle-orm/node-postgres";
import { rawPool } from "./raw";
import * as schema from "./schema";
import { scopedPool } from "./scope";

/* O pool do app aplica, em cada uso, o lojista e a loja ativa da sessão (ver ./scope.ts). */
export const pool = scopedPool(rawPool);
export const db = drizzle(pool, { schema });
