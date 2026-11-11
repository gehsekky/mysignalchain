/**
 * Loads the seed catalog into the database. Runs on every deploy, after
 * migrations (scripts/sync-catalog.ts).
 *
 * - The seed files are the source of truth for seeded items (`created_by`
 *   null): new ones are added as approved, changed ones are updated.
 * - Items users submitted are never touched, even if a seed item has the
 *   same brand and slug; that conflict is reported instead.
 * - Nothing is deleted: dropping an item from the seed files leaves it in
 *   the database, since catalog items are never hard-deleted.
 * - A seeded item's status is set only when it's first added, so an admin's
 *   merge sticks.
 */
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  brands as brandsTable,
  gearCategories,
  gearFinishes,
  gearItems,
  gearPortPaths,
  gearPorts,
} from "@/lib/db/schema";
import { catalogItemSchema, type CatalogItem } from "./item";
import type { SeedBrand } from "./seed/brands";
import type { SeedCategory } from "./seed/categories";
import { buildSearchText, slugify } from "./text";

export type SeedCatalog = {
  brands: SeedBrand[];
  categories: SeedCategory[];
  items: unknown[];
};

export type SyncResult = {
  added: string[];
  updated: string[];
  unchanged: number;
  /** Seed items whose brand and slug a user-submitted item already holds. */
  conflicts: string[];
};

/** JSON with object keys sorted, so values read back from JSONB compare equal. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, inner]) => inner !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/** Validates the whole seed up front, so a bad file fails the deploy before any write. */
export function parseSeed(seed: SeedCatalog): CatalogItem[] {
  const errors: string[] = [];
  const categorySlugs = new Set(
    seed.categories.flatMap((c) => [
      c.slug,
      ...(c.children ?? []).map((k) => k.slug),
    ]),
  );
  const brandSlugs = new Set(seed.brands.map((b) => b.slug));
  const items: CatalogItem[] = [];

  seed.items.forEach((raw, index) => {
    const parsed = catalogItemSchema.safeParse(raw);
    if (!parsed.success) {
      const name = (raw as { slug?: string }).slug ?? `#${index}`;
      for (const issue of parsed.error.issues) {
        errors.push(`${name}: ${issue.path.join(".")}: ${issue.message}`);
      }
      return;
    }
    const item = parsed.data;
    if (!brandSlugs.has(item.brand))
      errors.push(`${item.slug}: unknown brand ${item.brand}`);
    if (!categorySlugs.has(item.category)) {
      errors.push(`${item.slug}: unknown category ${item.category}`);
    }
    items.push(item);
  });

  const keys = new Set<string>();
  for (const item of items) {
    const key = `${item.brand}/${item.slug}`;
    if (keys.has(key)) errors.push(`${key}: listed twice`);
    keys.add(key);
  }
  for (const item of items) {
    if (item.variantOf && !keys.has(`${item.brand}/${item.variantOf}`)) {
      errors.push(
        `${item.brand}/${item.slug}: variant of unknown item ${item.variantOf}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid seed catalog:\n  ${errors.join("\n  ")}`);
  }
  return items;
}

type ItemRow = typeof gearItems.$inferSelect;

/** The parts of an item the sync owns, in a form both sides can produce. */
function fingerprint(
  row: Pick<
    ItemRow,
    | "modelName"
    | "categoryId"
    | "years"
    | "aliases"
    | "searchText"
    | "role"
    | "routingModel"
    | "routingSpec"
    | "specs"
    | "sourceUrl"
  >,
  ports: {
    key: string;
    label: string;
    direction: string;
    signalTypes: string[];
    jackGroup: string | null;
    spec: unknown;
    sort: number;
  }[],
  paths: {
    fromPortKey: string;
    toPortKey: string;
    activeWhenUnplugged: string | null;
  }[],
  finishes: { slug: string; name: string; sort: number }[],
): string {
  const byKey = <T>(list: T[], key: (t: T) => string) =>
    [...list].sort((a, b) => key(a).localeCompare(key(b)));
  return stable({
    modelName: row.modelName,
    categoryId: row.categoryId,
    years: row.years,
    aliases: row.aliases,
    searchText: row.searchText,
    role: row.role,
    routingModel: row.routingModel,
    routingSpec: row.routingSpec,
    specs: row.specs,
    sourceUrl: row.sourceUrl,
    ports: byKey(
      ports.map((p) => ({
        key: p.key,
        label: p.label,
        direction: p.direction,
        signalTypes: p.signalTypes,
        jackGroup: p.jackGroup,
        spec: p.spec,
        sort: p.sort,
      })),
      (p) => p.key,
    ),
    paths: byKey(
      paths.map((p) => ({
        fromPortKey: p.fromPortKey,
        toPortKey: p.toPortKey,
        activeWhenUnplugged: p.activeWhenUnplugged,
      })),
      (p) => `${p.fromPortKey}>${p.toPortKey}>${p.activeWhenUnplugged ?? ""}`,
    ),
    finishes: byKey(
      finishes.map((f) => ({ slug: f.slug, name: f.name, sort: f.sort })),
      (f) => f.slug,
    ),
  });
}

function rowsFor(item: CatalogItem, categoryId: string, brandName: string) {
  const { model, ...routingSpec } = item.routing;
  const row = {
    modelName: item.modelName,
    categoryId,
    years: item.years ?? null,
    aliases: item.aliases,
    searchText: buildSearchText(brandName, item.modelName, item.aliases),
    role: item.role ?? null,
    routingModel: model,
    routingSpec,
    specs: item.specs,
    sourceUrl: item.sourceUrl ?? null,
  };
  const ports = item.ports.map((port, sort) => ({
    key: port.key,
    label: port.label,
    direction: port.direction,
    signalTypes: port.signalTypes,
    jackGroup: port.jackGroup ?? null,
    spec: port.spec,
    sort,
  }));
  const paths = item.paths.map((p) => ({
    fromPortKey: p.from,
    toPortKey: p.to,
    activeWhenUnplugged: p.activeWhenUnplugged ?? null,
  }));
  const finishes = item.finishes.map((name, sort) => ({
    slug: slugify(name),
    name,
    sort,
  }));
  return { row, ports, paths, finishes };
}

export async function syncCatalog(
  db: Database,
  seed: SeedCatalog,
): Promise<SyncResult> {
  const items = parseSeed(seed);
  const result: SyncResult = {
    added: [],
    updated: [],
    unchanged: 0,
    conflicts: [],
  };

  await db.transaction(async (tx) => {
    // Categories: parents first, so children can point at them.
    const categoryIds = new Map<string, string>();
    const upsertCategory = async (
      slug: string,
      name: string,
      parentId: string | null,
      sort: number,
    ) => {
      const [row] = await tx
        .insert(gearCategories)
        .values({ slug, name, parentId, sort })
        .onConflictDoUpdate({
          target: gearCategories.slug,
          set: { name, parentId, sort, updatedAt: new Date() },
        })
        .returning({ id: gearCategories.id });
      categoryIds.set(slug, row!.id);
      return row!.id;
    };
    for (const [index, category] of seed.categories.entries()) {
      const parentId = await upsertCategory(
        category.slug,
        category.name,
        null,
        index,
      );
      for (const [childIndex, child] of (category.children ?? []).entries()) {
        await upsertCategory(child.slug, child.name, parentId, childIndex);
      }
    }

    const brandIds = new Map<string, string>();
    const brandNames = new Map(seed.brands.map((b) => [b.slug, b.name]));
    for (const brand of seed.brands) {
      const [row] = await tx
        .insert(brandsTable)
        .values(brand)
        .onConflictDoUpdate({
          target: brandsTable.slug,
          set: { name: brand.name, updatedAt: new Date() },
        })
        .returning({ id: brandsTable.id });
      brandIds.set(brand.slug, row!.id);
    }

    const existing = await tx
      .select()
      .from(gearItems)
      .where(inArray(gearItems.brandId, [...brandIds.values()]));
    const existingByKey = new Map(
      existing.map((row) => [`${row.brandId}/${row.slug}`, row]),
    );
    const seededIds = existing
      .filter((r) => r.createdBy === null)
      .map((r) => r.id);
    // One query at a time: a transaction holds a single connection.
    const ports = seededIds.length
      ? await tx
          .select()
          .from(gearPorts)
          .where(inArray(gearPorts.gearItemId, seededIds))
      : [];
    const paths = seededIds.length
      ? await tx
          .select()
          .from(gearPortPaths)
          .where(inArray(gearPortPaths.gearItemId, seededIds))
      : [];
    const finishes = seededIds.length
      ? await tx
          .select()
          .from(gearFinishes)
          .where(inArray(gearFinishes.gearItemId, seededIds))
      : [];
    const forItem = <T extends { gearItemId: string }>(list: T[], id: string) =>
      list.filter((entry) => entry.gearItemId === id);

    const idsBySlug = new Map<string, string>();

    for (const item of items) {
      const name = `${item.brand}/${item.slug}`;
      const brandId = brandIds.get(item.brand)!;
      const next = rowsFor(
        item,
        categoryIds.get(item.category)!,
        brandNames.get(item.brand)!,
      );
      const current = existingByKey.get(`${brandId}/${item.slug}`);

      if (current && current.createdBy !== null) {
        result.conflicts.push(name);
        continue;
      }

      let id: string;
      if (!current) {
        const [row] = await tx
          .insert(gearItems)
          .values({ ...next.row, brandId, slug: item.slug, status: "approved" })
          .returning({ id: gearItems.id });
        id = row!.id;
        result.added.push(name);
      } else {
        id = current.id;
        const before = fingerprint(
          current,
          forItem(ports, id),
          forItem(paths, id),
          forItem(finishes, id),
        );
        const after = fingerprint(
          next.row,
          next.ports,
          next.paths,
          next.finishes,
        );
        if (before === after) {
          result.unchanged += 1;
          idsBySlug.set(name, id);
          continue;
        }
        await tx
          .update(gearItems)
          .set({ ...next.row, updatedAt: new Date() })
          .where(eq(gearItems.id, id));
        // Paths go with their ports (foreign keys cascade).
        await tx.delete(gearPorts).where(eq(gearPorts.gearItemId, id));
        result.updated.push(name);
      }
      idsBySlug.set(name, id);

      if (next.ports.length) {
        await tx
          .insert(gearPorts)
          .values(next.ports.map((p) => ({ ...p, gearItemId: id })));
      }
      if (next.paths.length) {
        await tx
          .insert(gearPortPaths)
          .values(next.paths.map((p) => ({ ...p, gearItemId: id })));
      }
      // Finishes: upsert by slug and drop the ones no longer listed. Owned
      // units on a dropped finish keep its name as a custom finish.
      const dropped = and(
        eq(gearFinishes.gearItemId, id),
        next.finishes.length
          ? notInArray(
              gearFinishes.slug,
              next.finishes.map((f) => f.slug),
            )
          : undefined,
      );
      await tx.execute(sql`
        UPDATE owned_gear AS og
        SET custom_finish = gf.name, finish_id = NULL, updated_at = now()
        FROM gear_finishes AS gf
        WHERE og.finish_id = gf.id AND gf.id IN (
          SELECT ${gearFinishes.id} FROM ${gearFinishes} WHERE ${dropped}
        )
      `);
      await tx.delete(gearFinishes).where(dropped);
      for (const finish of next.finishes) {
        await tx
          .insert(gearFinishes)
          .values({ ...finish, gearItemId: id })
          .onConflictDoUpdate({
            target: [gearFinishes.gearItemId, gearFinishes.slug],
            set: { name: finish.name, sort: finish.sort },
          });
      }
    }

    // Variants, once every seeded item exists.
    for (const item of items) {
      const id = idsBySlug.get(`${item.brand}/${item.slug}`);
      if (!id) continue;
      const variantOfId = item.variantOf
        ? (idsBySlug.get(`${item.brand}/${item.variantOf}`) ?? null)
        : null;
      await tx
        .update(gearItems)
        .set({ variantOfId })
        .where(
          and(
            eq(gearItems.id, id),
            isNull(gearItems.createdBy),
            variantOfId
              ? or(
                  isNull(gearItems.variantOfId),
                  ne(gearItems.variantOfId, variantOfId),
                )
              : isNotNull(gearItems.variantOfId),
          ),
        );
    }
  });

  return result;
}
