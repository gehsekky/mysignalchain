/** Profile details a user can edit: display name and bio. */
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/** Collapses runs of spaces and strips control characters. */
const plainLine = (max: number) =>
  z
    .string()
    .transform((value) =>
      value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .pipe(z.string().max(max, `Use at most ${max} characters.`));

export const profileSchema = z.object({
  displayName: plainLine(50).pipe(z.string().min(1, "Enter a display name.")),
  bio: plainLine(160),
});
export type ProfileInput = z.input<typeof profileSchema>;

export type ProfileResult =
  | { status: "saved" }
  | { status: "invalid"; fieldErrors: Record<string, string[] | undefined> };

export async function updateProfile(
  db: Database,
  userId: string,
  input: ProfileInput,
  now = new Date(),
): Promise<ProfileResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "invalid",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  await db
    .update(users)
    .set({
      name: parsed.data.displayName,
      bio: parsed.data.bio || null,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
  return { status: "saved" };
}

export type PublicProfile = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  joinedAt: Date;
};

/** A finished account's public profile by handle, or null. */
export async function getProfile(
  db: Database,
  handle: string,
): Promise<PublicProfile | null> {
  const [row] = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.name,
      bio: users.bio,
      joinedAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        eq(users.handle, handle.toLowerCase()),
        isNotNull(users.ageCheckPassedAt),
      ),
    );
  return row ? { ...row, handle: row.handle! } : null;
}
