// Applies committed migrations. Plain JavaScript so the deploy image can run it
// without a TypeScript toolchain.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: process.env.MIGRATIONS_FOLDER ?? "./lib/db/migrations",
  });
  console.log("Migrations applied");
} finally {
  await pool.end();
}
