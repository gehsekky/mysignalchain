/**
 * Handle changes. Old handles go into handle_history: they redirect to the
 * current handle and stay reserved for the account, so nobody else can take
 * over old links. See "Handle changes keep old links working" in docs/PLAN.md.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/client";
import { handleHistory, users } from "@/lib/db/schema";
import { handleSchema } from "./index";

export const HANDLE_CHANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type HandleChangeResult =
  | { status: "changed"; handle: string }
  | { status: "unchanged" }
  | { status: "invalid"; message: string }
  | { status: "taken" }
  | { status: "too-soon"; nextChangeAt: Date };

/** When this user may next change their handle, or null if they may now. */
export async function nextHandleChangeAt(
  db: Database,
  userId: string,
  now = new Date(),
): Promise<Date | null> {
  const [last] = await db
    .select({ changedAt: handleHistory.changedAt })
    .from(handleHistory)
    .where(eq(handleHistory.userId, userId))
    .orderBy(desc(handleHistory.changedAt))
    .limit(1);
  if (!last) return null;
  const next = new Date(last.changedAt.getTime() + HANDLE_CHANGE_DAYS * DAY_MS);
  return next > now ? next : null;
}

export async function changeHandle(
  db: Database,
  userId: string,
  input: string,
  now = new Date(),
): Promise<HandleChangeResult> {
  const parsed = handleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "invalid",
      message: z.flattenError(parsed.error).formErrors[0] ?? "Invalid handle.",
    };
  }
  const handle = parsed.data;

  return db
    .transaction(async (tx): Promise<HandleChangeResult> => {
      // Lock the user's row so two changes can't race past the 30-day limit.
      const [user] = await tx
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user?.handle) throw new Error("Handle change for unknown user");
      if (user.handle === handle) return { status: "unchanged" } as const;

      const [last] = await tx
        .select({ changedAt: handleHistory.changedAt })
        .from(handleHistory)
        .where(eq(handleHistory.userId, userId))
        .orderBy(desc(handleHistory.changedAt))
        .limit(1);
      if (last) {
        const next = new Date(
          last.changedAt.getTime() + HANDLE_CHANGE_DAYS * DAY_MS,
        );
        if (next > now)
          return { status: "too-soon", nextChangeAt: next } as const;
      }

      // Taken by someone else now, or reserved as someone else's old handle.
      // A user may take back one of their own old handles.
      const [current] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.handle, handle));
      if (current) return { status: "taken" } as const;
      const [reserved] = await tx
        .select({ userId: handleHistory.userId })
        .from(handleHistory)
        .where(eq(handleHistory.oldHandle, handle))
        .for("update");
      if (reserved && reserved.userId !== userId) {
        return { status: "taken" } as const;
      }
      if (reserved) {
        await tx
          .delete(handleHistory)
          .where(
            and(
              eq(handleHistory.oldHandle, handle),
              eq(handleHistory.userId, userId),
            ),
          );
      }

      await tx
        .insert(handleHistory)
        .values({ oldHandle: user.handle, userId, changedAt: now });
      await tx
        .update(users)
        .set({ handle, updatedAt: now })
        .where(eq(users.id, userId));
      return { status: "changed", handle } as const;
    })
    .catch((error: unknown) => {
      // Someone else finished onboarding with it a moment ago.
      const cause = (error as { cause?: { code?: string } }).cause;
      if (cause?.code === "23505") return { status: "taken" } as const;
      throw error;
    });
}

/** Where an old handle now points, or null if it isn't one. */
export async function resolveOldHandle(
  db: Database,
  oldHandle: string,
): Promise<string | null> {
  const [row] = await db
    .select({ handle: users.handle })
    .from(handleHistory)
    .innerJoin(users, eq(users.id, handleHistory.userId))
    .where(eq(handleHistory.oldHandle, oldHandle.toLowerCase()));
  return row?.handle ?? null;
}

/** Onboarding must not hand out someone's reserved old handle. */
export async function isReservedHandle(
  db: Database,
  handle: string,
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql`1` })
    .from(handleHistory)
    .where(eq(handleHistory.oldHandle, handle));
  return Boolean(row);
}
