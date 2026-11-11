/**
 * Owned gear: units in a user's collection, each pointing at a catalog item.
 * Who may see a unit is decided by canViewOwnedGear in lib/policy.
 */
import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/client";
import {
  brands,
  gearCategories,
  gearFinishes,
  gearItems,
  ownedGear,
} from "@/lib/db/schema";

export const MAX_OWNED_GEAR = 500;
export const ADDS_PER_DAY = 100;

export const OWNED_STATUSES = ["owned", "wishlist", "sold"] as const;
export type OwnedStatus = (typeof OWNED_STATUSES)[number];

/** Text that keeps its line breaks but loses control characters. */
const text = (max: number) =>
  z
    .string()
    .default("")
    .transform((value) =>
      value
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
        .trim(),
    )
    .pipe(z.string().max(max, `Use at most ${max} characters.`));

const line = (max: number) =>
  text(max).transform((value) => value.replace(/\s+/g, " "));

export const ownedGearSchema = z.object({
  /** A finish id from the item, "other", or "" for none. */
  finish: z.string().default(""),
  customFinish: line(80),
  nickname: line(60),
  mods: text(1000),
  notes: text(2000),
  status: z.enum(OWNED_STATUSES, { error: "Pick a status." }),
  visibility: z.enum(["private", "public"]).default("private"),
});
export type OwnedGearInput = z.input<typeof ownedGearSchema>;

export type OwnedGearResult =
  | { status: "saved"; id: string }
  | { status: "invalid"; fieldErrors: Record<string, string[] | undefined> }
  | { status: "limit"; message: string }
  | { status: "not-found" };

const invalid = (field: string, message: string): OwnedGearResult => ({
  status: "invalid",
  fieldErrors: { [field]: [message] },
});

/** Resolves the finish fields against the item's own list of finishes. */
async function resolveFinish(
  db: Database,
  gearItemId: string,
  data: z.output<typeof ownedGearSchema>,
): Promise<
  { finishId: string | null; customFinish: string | null } | OwnedGearResult
> {
  if (data.finish === "" || data.finish === "none") {
    return { finishId: null, customFinish: null };
  }
  if (data.finish === "other") {
    if (!data.customFinish) {
      return invalid("customFinish", "Describe the finish, or pick one.");
    }
    return { finishId: null, customFinish: data.customFinish };
  }
  const id = z.uuid().safeParse(data.finish);
  if (!id.success) return invalid("finish", "Pick a finish from the list.");
  const [finish] = await db
    .select({ id: gearFinishes.id })
    .from(gearFinishes)
    .where(
      and(
        eq(gearFinishes.id, id.data),
        eq(gearFinishes.gearItemId, gearItemId),
      ),
    );
  if (!finish) return invalid("finish", "Pick a finish from the list.");
  return { finishId: finish.id, customFinish: null };
}

function parse(input: OwnedGearInput) {
  const parsed = ownedGearSchema.safeParse(input);
  return parsed.success
    ? ({ ok: true, data: parsed.data } as const)
    : ({
        ok: false,
        result: {
          status: "invalid",
          fieldErrors: z.flattenError(parsed.error).fieldErrors,
        },
      } as const satisfies { ok: false; result: OwnedGearResult });
}

/**
 * Adds a unit of a catalog item the user can see (lib/policy decides that
 * before calling). Merged items are followed to the item they became.
 */
export async function addOwnedGear(
  db: Database,
  userId: string,
  gearItemId: string,
  input: OwnedGearInput,
  now = new Date(),
): Promise<OwnedGearResult> {
  const parsed = parse(input);
  if (!parsed.ok) return parsed.result;

  const [{ total }] = await db
    .select({ total: count() })
    .from(ownedGear)
    .where(eq(ownedGear.userId, userId));
  if (total >= MAX_OWNED_GEAR) {
    return {
      status: "limit",
      message: `A collection can hold up to ${MAX_OWNED_GEAR} items.`,
    };
  }
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [{ today }] = await db
    .select({ today: count() })
    .from(ownedGear)
    .where(and(eq(ownedGear.userId, userId), gte(ownedGear.createdAt, since)));
  if (today >= ADDS_PER_DAY) {
    return {
      status: "limit",
      message: `You can add up to ${ADDS_PER_DAY} items a day. Try again tomorrow.`,
    };
  }

  const finish = await resolveFinish(db, gearItemId, parsed.data);
  if ("status" in finish) return finish;

  const { status, visibility, nickname, mods, notes } = parsed.data;
  const [row] = await db
    .insert(ownedGear)
    .values({
      userId,
      gearItemId,
      ...finish,
      nickname: nickname || null,
      mods: mods || null,
      notes: notes || null,
      status,
      visibility,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: ownedGear.id });
  return { status: "saved", id: row!.id };
}

export async function updateOwnedGear(
  db: Database,
  userId: string,
  id: string,
  input: OwnedGearInput,
  now = new Date(),
): Promise<OwnedGearResult> {
  const parsed = parse(input);
  if (!parsed.ok) return parsed.result;
  const [unit] = await db
    .select({ gearItemId: ownedGear.gearItemId })
    .from(ownedGear)
    .where(and(eq(ownedGear.id, id), eq(ownedGear.userId, userId)));
  if (!unit) return { status: "not-found" };

  const finish = await resolveFinish(db, unit.gearItemId, parsed.data);
  if ("status" in finish) return finish;

  const { status, visibility, nickname, mods, notes } = parsed.data;
  await db
    .update(ownedGear)
    .set({
      ...finish,
      nickname: nickname || null,
      mods: mods || null,
      notes: notes || null,
      status,
      visibility,
      updatedAt: now,
    })
    .where(and(eq(ownedGear.id, id), eq(ownedGear.userId, userId)));
  return { status: "saved", id };
}

export type OwnedGearRow = {
  id: string;
  userId: string;
  status: OwnedStatus;
  visibility: "private" | "public";
  nickname: string | null;
  mods: string | null;
  notes: string | null;
  finishId: string | null;
  finishName: string | null;
  customFinish: string | null;
  createdAt: Date;
  gearItem: {
    id: string;
    slug: string;
    modelName: string;
    brandSlug: string;
    brandName: string;
    categorySlug: string;
    /** The top-level category, for its illustration. */
    topCategorySlug: string;
    status: "pending" | "approved" | "rejected" | "merged";
    createdBy: string | null;
    reviewNote: string | null;
  };
};

function selectOwned(db: Database) {
  return db
    .select({
      id: ownedGear.id,
      userId: ownedGear.userId,
      status: ownedGear.status,
      visibility: ownedGear.visibility,
      nickname: ownedGear.nickname,
      mods: ownedGear.mods,
      notes: ownedGear.notes,
      finishId: ownedGear.finishId,
      finishName: gearFinishes.name,
      customFinish: ownedGear.customFinish,
      createdAt: ownedGear.createdAt,
      gearItem: {
        id: gearItems.id,
        slug: gearItems.slug,
        modelName: gearItems.modelName,
        brandSlug: brands.slug,
        brandName: brands.name,
        categorySlug: gearCategories.slug,
        topCategorySlug: sql<string>`coalesce((SELECT p.slug FROM gear_categories p WHERE p.id = ${gearCategories.parentId}), ${gearCategories.slug})`,
        status: gearItems.status,
        createdBy: gearItems.createdBy,
        reviewNote: gearItems.reviewNote,
      },
    })
    .from(ownedGear)
    .innerJoin(gearItems, eq(gearItems.id, ownedGear.gearItemId))
    .innerJoin(brands, eq(brands.id, gearItems.brandId))
    .innerJoin(gearCategories, eq(gearCategories.id, gearItems.categoryId))
    .leftJoin(gearFinishes, eq(gearFinishes.id, ownedGear.finishId));
}

/** Every unit in a collection; callers filter with canViewOwnedGear. */
export async function listOwnedGear(
  db: Database,
  userId: string,
): Promise<OwnedGearRow[]> {
  return selectOwned(db)
    .where(eq(ownedGear.userId, userId))
    .orderBy(
      asc(brands.name),
      asc(gearItems.modelName),
      asc(ownedGear.createdAt),
    );
}

export async function getOwnedGear(
  db: Database,
  id: string,
): Promise<OwnedGearRow | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await selectOwned(db).where(eq(ownedGear.id, id));
  return row ?? null;
}

/** Units of these catalog items that a user owns, for "In your collection". */
export async function ownedUnitsOf(
  db: Database,
  userId: string,
  gearItemIds: string[],
) {
  if (gearItemIds.length === 0) return [];
  return db
    .select({ id: ownedGear.id, status: ownedGear.status })
    .from(ownedGear)
    .where(
      and(
        eq(ownedGear.userId, userId),
        inArray(ownedGear.gearItemId, gearItemIds),
      ),
    );
}

/** An item's finishes, in order, for the finish picker. */
export async function listFinishes(db: Database, gearItemId: string) {
  return db
    .select({ id: gearFinishes.id, name: gearFinishes.name })
    .from(gearFinishes)
    .where(eq(gearFinishes.gearItemId, gearItemId))
    .orderBy(asc(gearFinishes.sort));
}
