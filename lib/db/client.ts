import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>["db"];

export function createDb(connectionString: string) {
  // One small server: a handful of connections is plenty.
  const pool = new Pool({ connectionString, max: 5 });
  return { db: drizzle(pool, { schema }), pool };
}

let cached: Database | undefined;

/** Connects on first use, so builds don't need a database. */
export function getDb(): Database {
  cached ??= createDb(getDatabaseUrl()).db;
  return cached;
}
