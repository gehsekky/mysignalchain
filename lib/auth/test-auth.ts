import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { getDb } from "@/lib/db/client";
import { buildAuthOptions } from "./options";

/** Test-only auth instance. Imported only after the test sign-in gate passes. */
export function createTestAuth() {
  const options = buildAuthOptions(getDb());
  return betterAuth({ ...options, plugins: [testUtils()] });
}
