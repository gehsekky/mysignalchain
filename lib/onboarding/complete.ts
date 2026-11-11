import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { handleSchema } from "@/lib/handles";
import { isReservedHandle } from "@/lib/handles/change";
import { isOldEnough } from "./age";

export const onboardingSchema = z.object({
  handle: handleSchema,
  birthMonth: z.coerce.number().int().min(1).max(12),
  birthYear: z.coerce.number().int().min(1900).max(2100),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export type OnboardingResult =
  | { status: "complete"; handle: string }
  | { status: "invalid"; fieldErrors: Record<string, string[] | undefined> }
  | { status: "handle-taken" }
  | { status: "too-young" };

const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause;
  return cause?.code === POSTGRES_UNIQUE_VIOLATION;
}

/** Failing the age check deletes the account, including its sessions. */
export async function completeOnboarding(
  db: Database,
  userId: string,
  input: OnboardingInput,
  now = new Date(),
): Promise<OnboardingResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "invalid",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const { handle, birthYear, birthMonth } = parsed.data;

  if (!isOldEnough(birthYear, birthMonth, now)) {
    await db.delete(users).where(eq(users.id, userId));
    return { status: "too-young" };
  }

  // Someone's old handle stays theirs; see lib/handles/change.ts.
  if (await isReservedHandle(db, handle)) return { status: "handle-taken" };

  try {
    const updated = await db
      .update(users)
      .set({ handle, ageCheckPassedAt: now, updatedAt: now })
      .where(and(eq(users.id, userId), isNull(users.handle)))
      .returning({ handle: users.handle });

    if (updated.length === 0) {
      // Onboarding already finished, for example in another tab.
      const [existing] = await db
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.id, userId));
      if (existing?.handle) {
        return { status: "complete", handle: existing.handle };
      }
      throw new Error("Onboarding found no such user");
    }

    return { status: "complete", handle };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "handle-taken" };
    throw error;
  }
}
