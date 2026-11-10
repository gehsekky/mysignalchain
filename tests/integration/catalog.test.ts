import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkGearAccess } from "@/lib/catalog/access";
import {
  approveItem,
  listPending,
  mergeItem,
  rejectItem,
} from "@/lib/catalog/moderate";
import {
  getGearItem,
  listCategories,
  listGearInCategory,
  resolveMergeTarget,
  searchGear,
} from "@/lib/catalog/queries";
import { brands, categories, seedItems } from "@/lib/catalog/seed";
import {
  MAX_PENDING,
  SUBMISSIONS_PER_DAY,
  submitGear,
  type SubmissionInput,
} from "@/lib/catalog/submit";
import { syncCatalog } from "@/lib/catalog/sync";
import { createDb } from "@/lib/db/client";
import { brands as brandsTable, gearItems, users } from "@/lib/db/schema";

const { db, pool } = createDb(process.env.DATABASE_URL!);
const seed = { brands, categories, items: seedItems };

async function createUser(id: string, role: "user" | "admin" = "user") {
  await db.insert(users).values({
    id,
    name: id,
    email: `${id}@example.com`,
    handle: id,
    ageCheckPassedAt: new Date(),
    role,
  });
}

async function itemId(brandSlug: string, slug: string) {
  const item = await getGearItem(db, brandSlug, slug);
  if (!item) throw new Error(`no item ${brandSlug}/${slug}`);
  return item.id;
}

const pedal: SubmissionInput = {
  brandName: "Acme Effects",
  modelName: "Fuzz Pro",
  categorySlug: "fuzz",
  template: "mono_pedal",
  volts: "9",
  ma: "15",
  polarity: "center_negative",
  finishes: "Red\nBlue, Red",
};

beforeEach(async () => {
  await db.execute(
    sql`truncate gear_items, brands, gear_categories, users restart identity cascade`,
  );
  await syncCatalog(db, seed);
});

afterAll(() => pool.end());

describe("catalog sync", () => {
  it("loads every seed item once, then finds nothing to change", async () => {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(gearItems);
    expect(n).toBe(seedItems.length);
    const again = await syncCatalog(db, seed);
    expect(again).toMatchObject({
      added: [],
      updated: [],
      unchanged: seedItems.length,
    });
  });

  it("updates a changed item and keeps an admin's merge", async () => {
    await createUser("admin", "admin");
    await mergeItem(
      db,
      "admin",
      await itemId("ibanez", "ts9"),
      await itemId("ibanez", "ts808"),
    );
    const changed = seedItems.map((item) =>
      item.slug === "ts9" ? { ...item, years: "1982–present" } : item,
    );
    const result = await syncCatalog(db, { ...seed, items: changed });
    expect(result.updated).toEqual(["ibanez/ts9"]);
    const ts9 = await getGearItem(db, "ibanez", "ts9");
    expect(ts9).toMatchObject({ years: "1982–present", status: "merged" });
  });

  it("never touches a user-submitted item with the same slug", async () => {
    await createUser("andy");
    const [boss] = await db
      .select()
      .from(brandsTable)
      .where(eq(brandsTable.slug, "boss"));
    await db
      .update(gearItems)
      .set({ createdBy: "andy", modelName: "Mine" })
      .where(eq(gearItems.slug, "sd-1"));
    const result = await syncCatalog(db, seed);
    expect(result.conflicts).toEqual(["boss/sd-1"]);
    const [row] = await db
      .select()
      .from(gearItems)
      .where(and(eq(gearItems.brandId, boss!.id), eq(gearItems.slug, "sd-1")));
    expect(row?.modelName).toBe("Mine");
  });

  it("rejects an invalid seed before writing anything", async () => {
    const broken = [
      ...seedItems,
      { ...seedItems[0]!, slug: "dupe", paths: [{ from: "x", to: "y" }] },
    ];
    await expect(syncCatalog(db, { ...seed, items: broken })).rejects.toThrow(
      /No port "x"/,
    );
  });
});

describe("search", () => {
  it.each([
    ["ibanes ts9", "ts9"],
    ["big muf", "big-muff-pi"],
    ["dellux reverb", "65-deluxe-reverb"],
    ["strymon timline", "timeline"],
    ["ds1", "ds-1"],
    ["tubescreamer", "ts9"],
    ["klon", "ktr"],
    ["marshal 4x12", "1960a"],
  ])("finds %s", async (query, slug) => {
    const results = await searchGear(db, query);
    expect(results.slice(0, 2).map((r) => r.slug)).toContain(slug);
  });

  it("returns nothing for gibberish or a one-letter query", async () => {
    expect(await searchGear(db, "zzqqxx")).toEqual([]);
    expect(await searchGear(db, "a")).toEqual([]);
  });

  it("only finds approved items", async () => {
    await createUser("andy");
    await submitGear(db, "andy", pedal);
    expect(await searchGear(db, "acme fuzz pro")).toEqual([]);
  });
});

describe("browsing", () => {
  it("counts approved items per category", async () => {
    const tree = await listCategories(db);
    const pedals = tree.find((c) => c.slug === "pedal")!;
    expect(pedals.children.find((c) => c.slug === "overdrive")?.count).toBe(5);
    const overdrive = await listGearInCategory(db, "pedal");
    expect(overdrive?.length).toBeGreaterThan(15);
    expect(await listGearInCategory(db, "nope")).toBeNull();
  });
});

describe("submissions", () => {
  beforeEach(() => createUser("andy"));

  it("stores a pending item with ports from the template, power and finishes", async () => {
    const result = await submitGear(db, "andy", pedal);
    expect(result).toEqual({
      status: "submitted",
      brandSlug: "acme-effects",
      slug: "fuzz-pro",
    });
    const item = await getGearItem(db, "acme-effects", "fuzz-pro");
    expect(item).toMatchObject({
      status: "pending",
      createdBy: "andy",
      finishes: ["Red", "Blue"],
    });
    expect(item!.ports.map((p) => p.key)).toEqual(["in", "out", "dc_in"]);
    expect(item!.ports[2]!.spec.power).toMatchObject({
      minVolts: 9,
      drawMa: 15,
      polarity: "center_negative",
    });
    expect(item!.paths).toHaveLength(1);
  });

  it("points at an existing public item instead of duplicating it", async () => {
    const result = await submitGear(db, "andy", {
      ...pedal,
      brandName: "boss",
      modelName: "SD-1",
    });
    expect(result).toEqual({
      status: "exists",
      brandSlug: "boss",
      slug: "sd-1",
    });
  });

  it("gives a second pending submission of the same model its own slug", async () => {
    await createUser("bea");
    await submitGear(db, "andy", pedal);
    const second = await submitGear(db, "bea", pedal);
    expect(second).toMatchObject({ status: "submitted", slug: "fuzz-pro-2" });
  });

  it("gives combos a built-in speaker and makes them a destination", async () => {
    await submitGear(db, "andy", {
      ...pedal,
      modelName: "Tube 30",
      categorySlug: "combo",
      template: "amp_fx_loop",
      volts: "",
    });
    const item = await getGearItem(db, "acme-effects", "tube-30");
    expect(item?.role).toBe("destination");
    expect(item!.ports.map((p) => p.key)).toEqual([
      "in",
      "send",
      "return",
      "speaker",
    ]);
  });

  it("rejects a top-level category and bad input", async () => {
    expect(
      await submitGear(db, "andy", { ...pedal, categorySlug: "pedal" }),
    ).toMatchObject({
      status: "invalid",
      fieldErrors: { categorySlug: ["Pick a category"] },
    });
    expect(
      await submitGear(db, "andy", { ...pedal, modelName: " " }),
    ).toMatchObject({
      status: "invalid",
    });
  });

  it(`allows ${SUBMISSIONS_PER_DAY} a day`, async () => {
    for (let i = 0; i < SUBMISSIONS_PER_DAY; i++) {
      expect(
        await submitGear(db, "andy", { ...pedal, modelName: `Model ${i}` }),
      ).toMatchObject({
        status: "submitted",
      });
    }
    expect(
      await submitGear(db, "andy", { ...pedal, modelName: "One more" }),
    ).toMatchObject({
      status: "limit",
    });
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect(
      await submitGear(
        db,
        "andy",
        { ...pedal, modelName: "Tomorrow" },
        tomorrow,
      ),
    ).toMatchObject({ status: "submitted" });
  });

  it(`allows at most ${MAX_PENDING} waiting for review`, async () => {
    // Two days' worth, far enough apart that neither hits the daily limit.
    const gap = 26 * 60 * 60 * 1000;
    for (let i = 0; i < MAX_PENDING; i++) {
      const when = new Date(Date.now() - (2 - Math.floor(i / 10)) * gap);
      await submitGear(db, "andy", { ...pedal, modelName: `Model ${i}` }, when);
    }
    expect(
      await submitGear(db, "andy", { ...pedal, modelName: "Too many" }),
    ).toMatchObject({
      status: "limit",
    });
  });
});

describe("moderation", () => {
  beforeEach(async () => {
    await createUser("andy");
    await createUser("admin", "admin");
    await submitGear(db, "andy", pedal);
  });

  it("approves or rejects only pending items", async () => {
    const id = await itemId("acme-effects", "fuzz-pro");
    expect((await listPending(db)).map((p) => p.slug)).toEqual(["fuzz-pro"]);
    expect(await approveItem(db, "admin", id)).toEqual({ status: "done" });
    expect(await rejectItem(db, "admin", id, "dupe")).toMatchObject({
      status: "invalid",
    });
    expect(await listPending(db)).toEqual([]);
    expect((await searchGear(db, "acme fuzz")).map((r) => r.slug)).toEqual([
      "fuzz-pro",
    ]);
  });

  it("keeps the note when rejecting", async () => {
    const id = await itemId("acme-effects", "fuzz-pro");
    await rejectItem(db, "admin", id, "  Not guitar gear  ");
    expect(await getGearItem(db, "acme-effects", "fuzz-pro")).toMatchObject({
      status: "rejected",
      reviewNote: "Not guitar gear",
    });
  });

  it("merges into an approved item, and redirects never chain", async () => {
    const fuzz = await itemId("acme-effects", "fuzz-pro");
    const bigMuff = await itemId("electro-harmonix", "big-muff-pi");
    const ts9 = await itemId("ibanez", "ts9");
    const ts808 = await itemId("ibanez", "ts808");

    expect(await mergeItem(db, "admin", fuzz, fuzz)).toMatchObject({
      status: "invalid",
    });
    expect(await mergeItem(db, "admin", ts9, fuzz)).toMatchObject({
      status: "invalid",
    });

    expect(await mergeItem(db, "admin", fuzz, bigMuff)).toEqual({
      status: "done",
    });
    expect(await mergeItem(db, "admin", ts808, fuzz)).toMatchObject({
      status: "invalid",
    });

    // Merge big muff into ts808: fuzz, merged into big muff, moves too.
    expect(await mergeItem(db, "admin", bigMuff, ts808)).toEqual({
      status: "done",
    });
    const [fuzzRow] = await db
      .select()
      .from(gearItems)
      .where(eq(gearItems.id, fuzz));
    expect(fuzzRow?.mergedIntoId).toBe(ts808);
    expect(await resolveMergeTarget(db, fuzzRow!.mergedIntoId!)).toMatchObject({
      brandSlug: "ibanez",
      slug: "ts808",
    });
  });

  it("enforces merge consistency in the database too", async () => {
    const fuzz = await itemId("acme-effects", "fuzz-pro");
    await expect(
      db
        .update(gearItems)
        .set({ status: "merged" })
        .where(eq(gearItems.id, fuzz)),
    ).rejects.toThrow();
    await expect(
      db
        .update(gearItems)
        .set({ status: "merged", mergedIntoId: fuzz })
        .where(eq(gearItems.id, fuzz)),
    ).rejects.toThrow();
  });
});

describe("checkGearAccess (used by proxy.ts)", () => {
  const viewer =
    (id: string, role: "user" | "admin" = "user") =>
    async () => ({
      id,
      handle: id,
      ageCheckPassedAt: new Date(),
      role,
    });
  const nobody = async () => null;

  it("shows approved items without loading the viewer", async () => {
    let loaded = false;
    const access = await checkGearAccess(db, "boss", "sd-1", async () => {
      loaded = true;
      return null;
    });
    expect(access).toEqual({ kind: "show" });
    expect(loaded).toBe(false);
  });

  it("404s missing items and pending ones the viewer can't see", async () => {
    await createUser("andy");
    await submitGear(db, "andy", pedal);
    expect(await checkGearAccess(db, "boss", "nope", nobody)).toEqual({
      kind: "not-found",
    });
    expect(
      await checkGearAccess(db, "acme-effects", "fuzz-pro", nobody),
    ).toEqual({
      kind: "not-found",
    });
    expect(
      await checkGearAccess(db, "acme-effects", "fuzz-pro", viewer("bea")),
    ).toEqual({
      kind: "not-found",
    });
    expect(
      await checkGearAccess(db, "acme-effects", "fuzz-pro", viewer("andy")),
    ).toEqual({
      kind: "show",
    });
    expect(
      await checkGearAccess(
        db,
        "acme-effects",
        "fuzz-pro",
        viewer("admin", "admin"),
      ),
    ).toEqual({ kind: "show" });
  });

  it("redirects merged items to the item they joined", async () => {
    await createUser("admin", "admin");
    await mergeItem(
      db,
      "admin",
      await itemId("ibanez", "ts9"),
      await itemId("ibanez", "ts808"),
    );
    expect(await checkGearAccess(db, "ibanez", "ts9", nobody)).toEqual({
      kind: "redirect",
      to: "/gear/ibanez/ts808",
    });
  });
});
