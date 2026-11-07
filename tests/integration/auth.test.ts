import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildAuthOptions } from "@/lib/auth/options";
import { createDb } from "@/lib/db/client";

const { db, pool } = createDb(process.env.DATABASE_URL!);

function createAuth(rateLimitEnabled: boolean) {
  return betterAuth({
    ...buildAuthOptions(db, { rateLimitEnabled }),
    plugins: [testUtils()],
  });
}

const baseUrl = process.env.BETTER_AUTH_URL!;

beforeEach(async () => {
  await db.execute(sql`truncate users cascade`);
});

afterAll(() => pool.end());

describe("Better Auth setup", () => {
  it("reads and writes our tables through the adapter", async () => {
    const auth = createAuth(false);
    const { test } = await auth.$context;
    const user = await test.saveUser(
      test.createUser({ email: "a@example.com", name: "A" }),
    );
    const { headers } = await test.login({ userId: user.id });

    const session = await auth.api.getSession({ headers });
    expect(session?.user.email).toBe("a@example.com");
    expect(session?.user.handle ?? null).toBeNull();
  });

  it("doesn't let a client set its handle through the update API", async () => {
    const auth = createAuth(false);
    const { test } = await auth.$context;
    const user = await test.saveUser(
      test.createUser({ email: "a@example.com", name: "A" }),
    );
    const { headers } = await test.login({ userId: user.id });
    headers.set("origin", baseUrl);
    headers.set("content-type", "application/json");

    await auth.handler(
      new Request(`${baseUrl}/api/auth/update-user`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          handle: "sneaky",
          ageCheckPassedAt: new Date(),
        }),
      }),
    );

    const session = await auth.api.getSession({ headers });
    expect(session?.user.handle ?? null).toBeNull();
    expect(session?.user.ageCheckPassedAt ?? null).toBeNull();
  });

  it("rate limits repeated sign-in attempts", async () => {
    const auth = createAuth(true);
    const attempt = () =>
      auth.handler(
        new Request(`${baseUrl}/api/auth/sign-in/social`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: baseUrl,
            "x-real-ip": "203.0.113.7",
          },
          body: JSON.stringify({ provider: "google" }),
        }),
      );

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});
