import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import type { Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getAuthEnv } from "@/lib/env";

export function buildAuthOptions(
  db: Database,
  overrides: { rateLimitEnabled?: boolean } = {},
) {
  const env = getAuthEnv();
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {};

  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema,
    }),
    socialProviders: google,
    user: {
      additionalFields: {
        // Set only by onboarding. `input: false` keeps them out of the API.
        handle: { type: "string", required: false, input: false },
        ageCheckPassedAt: { type: "date", required: false, input: false },
        // Granted by hand in the database; never settable through the API.
        role: { type: "string", required: false, input: false },
      },
    },
    account: {
      // We never call Google's APIs after sign-in, so these tokens are
      // unused. Encrypt them with BETTER_AUTH_SECRET so a database or backup
      // leak can't expose working Google tokens.
      encryptOAuthTokens: true,
    },
    databaseHooks: {
      // encryptOAuthTokens covers access and refresh tokens but not the ID
      // token, which carries the user's name, email and Google ID in plain
      // text. We never read it, so don't store it.
      account: {
        create: {
          before: async (account) => ({ data: { ...account, idToken: null } }),
        },
        update: {
          before: async (account) =>
            "idToken" in account
              ? { data: { ...account, idToken: null } }
              : undefined,
        },
      },
    },
    advanced: {
      // Nginx overwrites this header, so clients can't spoof it.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    rateLimit: {
      enabled:
        overrides.rateLimitEnabled ?? process.env.NODE_ENV === "production",
      // One server, so memory is enough. Counts reset on restart.
      storage: "memory",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/social": { window: 60, max: 10 },
        "/callback/*": { window: 60, max: 20 },
      },
    },
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions;
}
