import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/db/client";

export async function GET() {
  // Must run per request, never at build time.
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
