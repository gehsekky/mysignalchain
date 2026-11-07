import { z } from "zod";

const authEnvSchema = z.object({
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export function getDatabaseUrl(): string {
  return z.string().min(1).parse(process.env.DATABASE_URL);
}

/** Read on first use rather than at import, so builds don't need secrets. */
export function getAuthEnv() {
  return authEnvSchema.parse(process.env);
}
