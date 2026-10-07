import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations aplicadas.");
await pool.end();
