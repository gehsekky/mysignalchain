/**
 * Decides, before a gear page renders, whether it's a 404, a redirect or
 * fine to show. proxy.ts uses this so the response gets a real status code;
 * once a page starts streaming, its status is already 200.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { brands, gearItems } from "@/lib/db/schema";
import { canViewGearItem, type Viewer } from "@/lib/policy";
import { resolveMergeTarget } from "./queries";

export type GearAccess =
  { kind: "show" } | { kind: "not-found" } | { kind: "redirect"; to: string };

export async function checkGearAccess(
  db: Database,
  brandSlug: string,
  itemSlug: string,
  /** Only called when the item isn't public. */
  loadViewer: () => Promise<Viewer | null>,
): Promise<GearAccess> {
  const [item] = await db
    .select({
      status: gearItems.status,
      createdBy: gearItems.createdBy,
      mergedIntoId: gearItems.mergedIntoId,
    })
    .from(gearItems)
    .innerJoin(brands, eq(brands.id, gearItems.brandId))
    .where(and(eq(brands.slug, brandSlug), eq(gearItems.slug, itemSlug)));
  if (!item) return { kind: "not-found" };

  if (item.status === "merged" && item.mergedIntoId) {
    const target = await resolveMergeTarget(db, item.mergedIntoId);
    return target
      ? { kind: "redirect", to: `/gear/${target.brandSlug}/${target.slug}` }
      : { kind: "not-found" };
  }
  if (item.status === "approved") return { kind: "show" };
  return canViewGearItem(await loadViewer(), item)
    ? { kind: "show" }
    : { kind: "not-found" };
}
