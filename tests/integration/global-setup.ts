import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export default async function setup() {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    "postgres://mysignalchain:mysignalchain@127.0.0.1:5433/mysignalchain_test";
  const pool = new Pool({ connectionString, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./lib/db/migrations" });
  await pool.end();
}
