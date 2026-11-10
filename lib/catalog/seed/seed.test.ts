import { describe, expect, it } from "vitest";
import { catalogItemSchema } from "../item";
import { brands, categories, seedItems } from "./index";

const categorySlugs = new Set(
  categories.flatMap((c) => [c.slug, ...(c.children ?? []).map((k) => k.slug)]),
);
const brandSlugs = new Set(brands.map((b) => b.slug));

describe("seed catalog", () => {
  it.each(seedItems.map((item) => [`${item.brand}/${item.slug}`, item]))(
    "%s is valid",
    (_name, item) => {
      const result = catalogItemSchema.safeParse(item);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(brandSlugs).toContain(item.brand);
      expect(categorySlugs).toContain(item.category);
    },
  );

  it("has about 50 items with unique brand and slug pairs", () => {
    const keys = seedItems.map((item) => `${item.brand}/${item.slug}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(45);
  });

  it("only points variants at items from the same brand", () => {
    for (const item of seedItems.filter((i) => i.variantOf)) {
      expect(
        seedItems.some(
          (o) => o.brand === item.brand && o.slug === item.variantOf,
        ),
      ).toBe(true);
    }
  });

  it("flags every item that wasn't checked against the maker", () => {
    for (const item of seedItems.filter((i) => !i.sourceUrl)) {
      expect(
        item.specs?.unconfirmed?.length,
        `${item.brand}/${item.slug}`,
      ).toBeGreaterThan(0);
    }
  });

  it("covers the gear the plan asks for", () => {
    const categoriesUsed = new Set(seedItems.map((i) => i.category));
    for (const slug of [
      "electric-guitar",
      "overdrive",
      "combo",
      "head",
      "guitar-cab",
      "power-supply",
      "power-adapter",
      "expression-pedal",
      "modeler",
      "microphone",
      "loop-switcher",
    ]) {
      expect(categoriesUsed).toContain(slug);
    }
  });

  it("uses no brand or category that isn't defined", () => {
    expect(new Set(brands.map((b) => b.slug)).size).toBe(brands.length);
    const unusedBrands = brands.filter(
      (b) => !seedItems.some((i) => i.brand === b.slug),
    );
    expect(unusedBrands).toEqual([]);
  });
});
