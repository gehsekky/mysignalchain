/**
 * Admin actions on the catalog. Callers check canModerateCatalog first; these
 * enforce the state rules:
 *
 * - Only pending items can be approved or rejected.
 * - A pending or approved item can be merged into a different approved item.
 *   Items already merged into it move to the new target, so redirects never
 *   chain. Catalog items are never deleted.
 * - Merging moves owned units and gear page photos to the target. A unit's
 *   finish maps to the target's finish with the same name; otherwise it
 *   becomes a custom finish with the old name.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  brands,
  gearCategories,
  gearItemImages,
  gearItems,
  users,
} from "@/lib/db/schema";

export type ModerationResult =
  | { status: "done" }
  | { status: "not-found" }
  | { status: "invalid"; message: string };

export async function approveItem(
  db: Database,
  adminId: string,
  itemId: string,
  now = new Date(),
): Promise<ModerationResult> {
  const updated = await db
    .update(gearItems)
    .set({
      status: "approved",
      reviewedBy: adminId,
      reviewedAt: now,
      reviewNote: null,
      updatedAt: now,
    })
    .where(and(eq(gearItems.id, itemId), eq(gearItems.status, "pending")))
    .returning({ id: gearItems.id });
  return updated.length ? { status: "done" } : notPending(db, itemId);
}

export async function rejectItem(
  db: Database,
  adminId: string,
  itemId: string,
  note: string,
  now = new Date(),
): Promise<ModerationResult> {
  const updated = await db
    .update(gearItems)
    .set({
      status: "rejected",
      reviewedBy: adminId,
      reviewedAt: now,
      reviewNote: note.trim().slice(0, 500) || null,
      updatedAt: now,
    })
    .where(and(eq(gearItems.id, itemId), eq(gearItems.status, "pending")))
    .returning({ id: gearItems.id });
  return updated.length ? { status: "done" } : notPending(db, itemId);
}

async function notPending(
  db: Database,
  itemId: string,
): Promise<ModerationResult> {
  const [item] = await db
    .select({ status: gearItems.status })
    .from(gearItems)
    .where(eq(gearItems.id, itemId));
  return item
    ? { status: "invalid", message: `This item is already ${item.status}.` }
    : { status: "not-found" };
}

export async function mergeItem(
  db: Database,
  adminId: string,
  itemId: string,
  targetId: string,
  now = new Date(),
): Promise<ModerationResult> {
  if (itemId === targetId) {
    return {
      status: "invalid",
      message: "An item can't be merged into itself.",
    };
  }
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: gearItems.id, status: gearItems.status })
      .from(gearItems)
      .where(inArray(gearItems.id, [itemId, targetId]))
      .for("update");
    const item = rows.find((r) => r.id === itemId);
    const target = rows.find((r) => r.id === targetId);
    if (!item || !target) return { status: "not-found" } as const;
    if (item.status !== "pending" && item.status !== "approved") {
      return {
        status: "invalid",
        message: `This item is already ${item.status}.`,
      } as const;
    }
    if (target.status !== "approved") {
      return {
        status: "invalid",
        message:
          "Merge into an approved item, not a pending, rejected or merged one.",
      } as const;
    }

    await tx
      .update(gearItems)
      .set({ mergedIntoId: targetId, updatedAt: now })
      .where(eq(gearItems.mergedIntoId, itemId));
    // Every expression on the right reads the row as it was before.
    await tx.execute(sql`
      UPDATE owned_gear AS og SET
        gear_item_id = ${targetId},
        finish_id = (
          SELECT tf.id FROM gear_finishes sf
          JOIN gear_finishes tf
            ON tf.gear_item_id = ${targetId} AND lower(tf.name) = lower(sf.name)
          WHERE sf.id = og.finish_id
          ORDER BY tf.sort LIMIT 1
        ),
        custom_finish = CASE
          WHEN og.finish_id IS NULL THEN og.custom_finish
          WHEN EXISTS (
            SELECT 1 FROM gear_finishes sf
            JOIN gear_finishes tf
              ON tf.gear_item_id = ${targetId} AND lower(tf.name) = lower(sf.name)
            WHERE sf.id = og.finish_id
          ) THEN NULL
          ELSE (SELECT name FROM gear_finishes WHERE id = og.finish_id)
        END,
        updated_at = ${now}
      WHERE og.gear_item_id = ${itemId}
    `);
    await tx
      .update(gearItemImages)
      .set({ gearItemId: targetId })
      .where(eq(gearItemImages.gearItemId, itemId));
    await tx
      .update(gearItems)
      .set({
        status: "merged",
        mergedIntoId: targetId,
        reviewedBy: adminId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(gearItems.id, itemId));
    return { status: "done" } as const;
  });
}

/** The review queue, oldest first. */
export async function listPending(db: Database) {
  return db
    .select({
      id: gearItems.id,
      brandSlug: brands.slug,
      brandName: brands.name,
      slug: gearItems.slug,
      modelName: gearItems.modelName,
      categoryName: gearCategories.name,
      submittedBy: users.handle,
      createdAt: gearItems.createdAt,
    })
    .from(gearItems)
    .innerJoin(brands, eq(brands.id, gearItems.brandId))
    .innerJoin(gearCategories, eq(gearCategories.id, gearItems.categoryId))
    .leftJoin(users, eq(users.id, gearItems.createdBy))
    .where(eq(gearItems.status, "pending"))
    .orderBy(asc(gearItems.createdAt));
}
