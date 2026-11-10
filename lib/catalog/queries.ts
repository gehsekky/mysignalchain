/**
 * Read queries for catalog pages. Visibility rules come from the policy
 * module; these only fetch.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  brands,
  gearCategories,
  gearFinishes,
  gearItems,
  gearPortPaths,
  gearPorts,
} from "@/lib/db/schema";
import { normalizeSearch } from "./text";

/** How closely a query must match some run of words in an item's search text. */
export const SEARCH_THRESHOLD = 0.45;

export type GearListItem = {
  id: string;
  brandSlug: string;
  brandName: string;
  slug: string;
  modelName: string;
  categorySlug: string;
  categoryName: string;
};

const listColumns = {
  id: gearItems.id,
  brandSlug: brands.slug,
  brandName: brands.name,
  slug: gearItems.slug,
  modelName: gearItems.modelName,
  categorySlug: gearCategories.slug,
  categoryName: gearCategories.name,
};

/**
 * Approved items matching a query, best first. Trigram matching tolerates
 * typos ("ibanes ts9", "dellux reverb").
 */
export async function searchGear(
  db: Database,
  query: string,
  limit = 20,
): Promise<GearListItem[]> {
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  return db.transaction(async (tx) => {
    // `<%` uses the trigram index; its threshold is a session setting.
    await tx.execute(
      sql`select set_config('pg_trgm.word_similarity_threshold', ${String(SEARCH_THRESHOLD)}, true)`,
    );
    return tx
      .select(listColumns)
      .from(gearItems)
      .innerJoin(brands, eq(brands.id, gearItems.brandId))
      .innerJoin(gearCategories, eq(gearCategories.id, gearItems.categoryId))
      .where(
        and(
          eq(gearItems.status, "approved"),
          sql`${q} <% ${gearItems.searchText}`,
        ),
      )
      .orderBy(
        sql`word_similarity(${q}, ${gearItems.searchText}) desc`,
        asc(brands.name),
        asc(gearItems.modelName),
      )
      .limit(limit);
  });
}

export type CategoryWithChildren = {
  slug: string;
  name: string;
  children: { slug: string; name: string; count: number }[];
};

/** The category tree with approved-item counts per subcategory. */
export async function listCategories(
  db: Database,
): Promise<CategoryWithChildren[]> {
  const rows = await db
    .select({
      id: gearCategories.id,
      slug: gearCategories.slug,
      name: gearCategories.name,
      parentId: gearCategories.parentId,
      count: sql<number>`count(${gearItems.id})::int`,
    })
    .from(gearCategories)
    .leftJoin(
      gearItems,
      and(
        eq(gearItems.categoryId, gearCategories.id),
        eq(gearItems.status, "approved"),
      ),
    )
    .groupBy(gearCategories.id)
    .orderBy(asc(gearCategories.sort), asc(gearCategories.name));
  return rows
    .filter((row) => row.parentId === null)
    .map((parent) => ({
      slug: parent.slug,
      name: parent.name,
      children: rows
        .filter((row) => row.parentId === parent.id)
        .map(({ slug, name, count }) => ({ slug, name, count })),
    }));
}

/** Approved items in a category, or in any child of a top-level category. */
export async function listGearInCategory(
  db: Database,
  categorySlug: string,
): Promise<GearListItem[] | null> {
  const [category] = await db
    .select({ id: gearCategories.id })
    .from(gearCategories)
    .where(eq(gearCategories.slug, categorySlug));
  if (!category) return null;
  const children = await db
    .select({ id: gearCategories.id })
    .from(gearCategories)
    .where(eq(gearCategories.parentId, category.id));
  const ids = [category.id, ...children.map((c) => c.id)];
  return db
    .select(listColumns)
    .from(gearItems)
    .innerJoin(brands, eq(brands.id, gearItems.brandId))
    .innerJoin(gearCategories, eq(gearCategories.id, gearItems.categoryId))
    .where(
      and(eq(gearItems.status, "approved"), inArray(gearItems.categoryId, ids)),
    )
    .orderBy(asc(brands.name), asc(gearItems.modelName));
}

export type GearItemPage = NonNullable<Awaited<ReturnType<typeof getGearItem>>>;

/** Everything a gear page shows, by brand and item slug. */
export async function getGearItem(
  db: Database,
  brandSlug: string,
  itemSlug: string,
) {
  const [item] = await db
    .select({
      item: gearItems,
      brand: { slug: brands.slug, name: brands.name },
      category: {
        slug: gearCategories.slug,
        name: gearCategories.name,
        parentId: gearCategories.parentId,
      },
    })
    .from(gearItems)
    .innerJoin(brands, eq(brands.id, gearItems.brandId))
    .innerJoin(gearCategories, eq(gearCategories.id, gearItems.categoryId))
    .where(and(eq(brands.slug, brandSlug), eq(gearItems.slug, itemSlug)));
  if (!item) return null;

  const id = item.item.id;
  const [ports, paths, finishes, parent, variantOf] = [
    await db
      .select()
      .from(gearPorts)
      .where(eq(gearPorts.gearItemId, id))
      .orderBy(asc(gearPorts.sort)),
    await db
      .select()
      .from(gearPortPaths)
      .where(eq(gearPortPaths.gearItemId, id)),
    await db
      .select({ name: gearFinishes.name })
      .from(gearFinishes)
      .where(eq(gearFinishes.gearItemId, id))
      .orderBy(asc(gearFinishes.sort)),
    item.category.parentId
      ? (
          await db
            .select({ slug: gearCategories.slug, name: gearCategories.name })
            .from(gearCategories)
            .where(eq(gearCategories.id, item.category.parentId))
        )[0]
      : undefined,
    item.item.variantOfId
      ? (await itemLinks(db, [item.item.variantOfId]))[0]
      : undefined,
  ];

  return {
    ...item.item,
    brand: item.brand,
    category: item.category,
    topCategory: parent ?? {
      slug: item.category.slug,
      name: item.category.name,
    },
    ports,
    paths,
    finishes: finishes.map((f) => f.name),
    variantOf: variantOf ?? null,
  };
}

/** Brand and slug for items, to link to them. */
export async function itemLinks(db: Database, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      id: gearItems.id,
      status: gearItems.status,
      brandSlug: brands.slug,
      brandName: brands.name,
      slug: gearItems.slug,
      modelName: gearItems.modelName,
    })
    .from(gearItems)
    .innerJoin(brands, eq(brands.id, gearItems.brandId))
    .where(inArray(gearItems.id, ids));
}

/**
 * Where a merged item's URL should point: follows merged_into_id to the item
 * that isn't merged. Merges never target a merged item, but this copes with
 * a chain anyway and stops after a few hops.
 */
export async function resolveMergeTarget(db: Database, mergedIntoId: string) {
  let id = mergedIntoId;
  for (let hop = 0; hop < 5; hop++) {
    const [target] = await db
      .select({
        id: gearItems.id,
        status: gearItems.status,
        mergedIntoId: gearItems.mergedIntoId,
        brandSlug: brands.slug,
        slug: gearItems.slug,
      })
      .from(gearItems)
      .innerJoin(brands, eq(brands.id, gearItems.brandId))
      .where(eq(gearItems.id, id));
    if (!target) return null;
    if (target.status !== "merged" || !target.mergedIntoId) return target;
    id = target.mergedIntoId;
  }
  return null;
}
