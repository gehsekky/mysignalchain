import { betterAuth } from "better-auth";
import { getDb } from "@/lib/db/client";
import { buildAuthOptions } from "./options";

function createAuth() {
  return betterAuth(buildAuthOptions(getDb()));
}

let cached: ReturnType<typeof createAuth> | undefined;

/** Created on first use, so builds don't need secrets or a database. */
export function getAuth() {
  cached ??= createAuth();
  return cached;
}
