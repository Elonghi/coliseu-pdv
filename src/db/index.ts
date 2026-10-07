import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { coliseuPool?: Pool };
export const pool = globalForDb.coliseuPool ?? new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://coliseu:coliseu@localhost:55432/coliseu", max: 20 });
if (process.env.NODE_ENV !== "production") globalForDb.coliseuPool = pool;
export const db = drizzle(pool, { schema });
