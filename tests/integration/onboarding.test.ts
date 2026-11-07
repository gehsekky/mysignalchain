import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import { accounts, sessions, users } from "@/lib/db/schema";
import { completeOnboarding } from "@/lib/onboarding/complete";

const { db, pool } = createDb(process.env.DATABASE_URL!);
const now = new Date("2026-11-07T12:00:00Z");
const adult = { birthMonth: "6", birthYear: "1985" };

async function createUser(id: string) {
  await db.insert(users).values({ id, name: id, email: `${id}@example.com` });
}

beforeEach(async () => {
  await db.execute(sql`truncate users cascade`);
});

afterAll(() => pool.end());

describe("completeOnboarding", () => {
  it("stores the handle and age check, and no birth date", async () => {
    await createUser("a");
    const result = await completeOnboarding(
      db,
      "a",
      { handle: " Andy ", ...adult },
      now,
    );

    expect(result).toEqual({ status: "complete", handle: "andy" });
    const [row] = await db.select().from(users).where(eq(users.id, "a"));
    expect(row?.handle).toBe("andy");
    expect(row?.ageCheckPassedAt).toEqual(now);
    expect(Object.keys(row!).join()).not.toMatch(/birth/i);
  });

  it("reports a taken handle, case-insensitively", async () => {
    await createUser("a");
    await createUser("b");
    await completeOnboarding(db, "a", { handle: "andy", ...adult }, now);

    const result = await completeOnboarding(
      db,
      "b",
      { handle: "ANDY", ...adult },
      now,
    );
    expect(result).toEqual({ status: "handle-taken" });
  });

  it("deletes the account and its sessions when too young", async () => {
    await createUser("kid");
    await db.insert(sessions).values({
      id: "s1",
      token: "t1",
      userId: "kid",
      expiresAt: new Date("2030-01-01"),
    });
    await db.insert(accounts).values({
      id: "acc1",
      accountId: "google-1",
      providerId: "google",
      userId: "kid",
    });

    const result = await completeOnboarding(
      db,
      "kid",
      { handle: "kiddo", birthMonth: "1", birthYear: "2020" },
      now,
    );

    expect(result).toEqual({ status: "too-young" });
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(accounts)).toHaveLength(0);
  });

  it("rejects an invalid handle without changing the user", async () => {
    await createUser("a");
    const result = await completeOnboarding(
      db,
      "a",
      { handle: "admin", ...adult },
      now,
    );

    expect(result.status).toBe("invalid");
    const [row] = await db.select().from(users).where(eq(users.id, "a"));
    expect(row?.handle).toBeNull();
  });

  it("doesn't change a handle that's already set", async () => {
    await createUser("a");
    await completeOnboarding(db, "a", { handle: "first", ...adult }, now);
    const result = await completeOnboarding(
      db,
      "a",
      { handle: "second", ...adult },
      now,
    );

    expect(result).toEqual({ status: "complete", handle: "first" });
  });
});

describe("users table", () => {
  it("rejects a badly formatted handle at the database level", async () => {
    await expect(
      db.insert(users).values({
        id: "bad",
        name: "bad",
        email: "bad@example.com",
        handle: "Not Valid",
      }),
    ).rejects.toThrow();
  });
});
