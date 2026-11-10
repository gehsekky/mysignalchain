/**
 * User submissions to the catalog. A submission is stored as `pending`,
 * visible only to its submitter and admins (see canViewGearItem), until an
 * admin approves, rejects or merges it.
 */
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/client";
import {
  brands,
  gearCategories,
  gearFinishes,
  gearItems,
  gearPortPaths,
  gearPorts,
} from "@/lib/db/schema";
import { catalogItemSchema } from "./item";
import { buildFromTemplate, TEMPLATES, type TemplateKey } from "./templates";
import { buildSearchText, slugify } from "./text";

export const SUBMISSIONS_PER_DAY = 10;
export const MAX_PENDING = 20;

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().pipe(schema).optional(),
  );

const checkbox = z
  .preprocess((v) => v === "on" || v === true, z.boolean())
  .optional();

/** A list typed one per line or separated by commas, without repeats. */
const list = z
  .string()
  .max(1000)
  .default("")
  .transform((value) => {
    const entries = value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    return [...new Map(entries.map((e) => [e.toLowerCase(), e])).values()];
  })
  .pipe(z.array(z.string().max(80)).max(40));

export const submissionSchema = z.object({
  brandName: z.string().trim().min(1, "Enter the brand").max(60),
  modelName: z.string().trim().min(1, "Enter the model").max(80),
  categorySlug: z.string().min(1, "Pick a category"),
  years: z.string().trim().max(40).optional(),
  template: z.enum(Object.keys(TEMPLATES) as [TemplateKey, ...TemplateKey[]], {
    error: "Pick the kind of gear",
  }),
  volts: optionalNumber(z.number().positive().max(250)),
  ma: optionalNumber(z.number().nonnegative().max(100_000)),
  polarity: z.enum(["center_negative", "center_positive", ""]).optional(),
  expression: checkbox,
  tap: checkbox,
  midiIn: checkbox,
  midiOut: checkbox,
  aliases: list,
  finishes: list,
  sourceUrl: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .url({ protocol: /^https?$/, error: "Enter a full web address" })
      .max(500)
      .optional(),
  ),
});
export type SubmissionInput = z.input<typeof submissionSchema>;

export type SubmissionResult =
  | { status: "submitted"; brandSlug: string; slug: string }
  | { status: "invalid"; fieldErrors: Record<string, string[] | undefined> }
  | { status: "exists"; brandSlug: string; slug: string }
  | { status: "limit"; message: string };

function invalid(field: string, message: string): SubmissionResult {
  return { status: "invalid", fieldErrors: { [field]: [message] } };
}

export async function submitGear(
  db: Database,
  userId: string,
  input: SubmissionInput,
  now = new Date(),
): Promise<SubmissionResult> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "invalid",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const data = parsed.data;

  const brandSlug = slugify(data.brandName);
  const baseSlug = slugify(data.modelName);
  if (!brandSlug)
    return invalid("brandName", "Use letters or digits in the brand");
  if (!baseSlug)
    return invalid("modelName", "Use letters or digits in the model");

  const [category] = await db
    .select({
      id: gearCategories.id,
      slug: gearCategories.slug,
      parentId: gearCategories.parentId,
    })
    .from(gearCategories)
    .where(eq(gearCategories.slug, data.categorySlug));
  if (!category || category.parentId === null) {
    return invalid("categorySlug", "Pick a category");
  }

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [[today], [pending]] = [
    await db
      .select({ n: count() })
      .from(gearItems)
      .where(
        and(eq(gearItems.createdBy, userId), gte(gearItems.createdAt, dayAgo)),
      ),
    await db
      .select({ n: count() })
      .from(gearItems)
      .where(
        and(eq(gearItems.createdBy, userId), eq(gearItems.status, "pending")),
      ),
  ];
  if ((today?.n ?? 0) >= SUBMISSIONS_PER_DAY) {
    return {
      status: "limit",
      message: `You can submit up to ${SUBMISSIONS_PER_DAY} items a day. Try again tomorrow.`,
    };
  }
  if ((pending?.n ?? 0) >= MAX_PENDING) {
    return {
      status: "limit",
      message: `You have ${MAX_PENDING} items waiting for review. Please wait until some are reviewed.`,
    };
  }

  const power =
    data.volts === undefined
      ? undefined
      : {
          volts: data.volts,
          ma: data.ma,
          polarity: data.polarity || undefined,
        };
  const shape = buildFromTemplate(data.template, {
    combo: category.slug === "combo",
    power,
    extras: data,
  });

  return db.transaction(async (tx) => {
    const [existingBrand] = await tx
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(eq(brands.slug, brandSlug));
    const brand =
      existingBrand ??
      (
        await tx
          .insert(brands)
          .values({ slug: brandSlug, name: data.brandName })
          .returning({ id: brands.id, name: brands.name })
      )[0]!;

    // Same brand and model: point at a public item; otherwise pick a free slug.
    const taken = await tx
      .select({ slug: gearItems.slug, status: gearItems.status })
      .from(gearItems)
      .where(eq(gearItems.brandId, brand.id));
    const visible = taken.find(
      (t) =>
        t.slug === baseSlug &&
        (t.status === "approved" || t.status === "merged"),
    );
    if (visible)
      return { status: "exists", brandSlug, slug: visible.slug } as const;
    const used = new Set(taken.map((t) => t.slug));
    let slug = baseSlug;
    for (let n = 2; used.has(slug); n++) slug = `${baseSlug}-${n}`;

    const checked = catalogItemSchema.safeParse({
      brand: brandSlug,
      slug,
      modelName: data.modelName,
      category: category.slug,
      years: data.years || undefined,
      routing: { model: "fixed" },
      aliases: data.aliases,
      finishes: data.finishes,
      sourceUrl: data.sourceUrl?.startsWith("https://")
        ? data.sourceUrl
        : undefined,
      ...shape,
    });
    if (!checked.success) {
      return {
        status: "invalid",
        fieldErrors: { form: checked.error.issues.map((i) => i.message) },
      } as const;
    }
    const item = checked.data;

    const [row] = await tx
      .insert(gearItems)
      .values({
        brandId: brand.id,
        slug,
        modelName: item.modelName,
        categoryId: category.id,
        years: item.years ?? null,
        aliases: item.aliases,
        searchText: buildSearchText(brand.name, item.modelName, item.aliases),
        status: "pending",
        createdBy: userId,
        role: item.role ?? null,
        routingModel: "fixed",
        routingSpec: {},
        specs: {},
        sourceUrl: item.sourceUrl ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: gearItems.id });
    const id = row!.id;

    await tx.insert(gearPorts).values(
      item.ports.map((port, sort) => ({
        gearItemId: id,
        key: port.key,
        label: port.label,
        direction: port.direction,
        signalTypes: port.signalTypes,
        jackGroup: port.jackGroup ?? null,
        spec: port.spec,
        sort,
      })),
    );
    if (item.paths.length) {
      await tx.insert(gearPortPaths).values(
        item.paths.map((p) => ({
          gearItemId: id,
          fromPortKey: p.from,
          toPortKey: p.to,
          activeWhenUnplugged: p.activeWhenUnplugged ?? null,
        })),
      );
    }
    const finishes = [
      ...new Map(item.finishes.map((f) => [slugify(f), f])).entries(),
    ]
      .filter(([s]) => s)
      .map(([s, name], sort) => ({ gearItemId: id, slug: s, name, sort }));
    if (finishes.length) await tx.insert(gearFinishes).values(finishes);

    return { status: "submitted", brandSlug, slug } as const;
  });
}

/** A user's own submissions, newest first. */
export async function listSubmissions(db: Database, userId: string) {
  return db
    .select({
      brandSlug: brands.slug,
      brandName: brands.name,
      slug: gearItems.slug,
      modelName: gearItems.modelName,
      status: gearItems.status,
      reviewNote: gearItems.reviewNote,
      createdAt: gearItems.createdAt,
    })
    .from(gearItems)
    .innerJoin(brands, eq(brands.id, gearItems.brandId))
    .where(eq(gearItems.createdBy, userId))
    .orderBy(desc(gearItems.createdAt));
}
