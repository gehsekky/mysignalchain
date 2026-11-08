import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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

afterEach(() => {
  vi.restoreAllMocks();
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

  it("encrypts Google's access token and doesn't store its ID token", async () => {
    process.env.GOOGLE_CLIENT_ID ??= "test-client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-secret";
    const auth = createAuth(false);

    // Start sign-in to get the state Google would send back.
    const start = await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      }),
    );
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state")!;
    const cookies = start.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    // Stand in for Google's token endpoint.
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const idToken = [
      b64({ alg: "none", typ: "JWT" }),
      b64({
        sub: "google-123",
        email: "oauth@example.com",
        email_verified: true,
        name: "OAuth User",
        picture: "https://example.com/p.png",
        aud: process.env.GOOGLE_CLIENT_ID,
        iss: "https://accounts.google.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      "",
    ].join(".");
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const target = input instanceof Request ? input.url : String(input);
      if (target.startsWith("https://oauth2.googleapis.com/token")) {
        return Response.json({
          access_token: "plain-access-token",
          id_token: idToken,
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid email profile",
        });
      }
      return realFetch(input, init);
    });

    const callback = await auth.handler(
      new Request(
        `${baseUrl}/api/auth/callback/google?code=fake-code&state=${state}`,
        { headers: { cookie: cookies } },
      ),
    );
    expect(callback.status).toBe(302);

    const rows = await db.execute<{ access_token: string; id_token: string }>(
      sql`select access_token, id_token from accounts where provider_id = 'google'`,
    );
    expect(rows.rows).toHaveLength(1);
    const [row] = rows.rows;
    expect(row.access_token).not.toBe("plain-access-token");
    expect(row.access_token).not.toContain("plain");
    expect(row.id_token).toBeNull();

    // Signing in again updates the account; the ID token must stay unstored.
    const again = await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      }),
    );
    const againState = new URL(
      ((await again.json()) as { url: string }).url,
    ).searchParams.get("state")!;
    const againCookies = again.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const second = await auth.handler(
      new Request(
        `${baseUrl}/api/auth/callback/google?code=fake-code-2&state=${againState}`,
        { headers: { cookie: againCookies } },
      ),
    );
    expect(second.status).toBe(302);
    const after = await db.execute<{ id_token: string | null }>(
      sql`select id_token from accounts where provider_id = 'google'`,
    );
    expect(after.rows).toEqual([{ id_token: null }]);
  });
});
