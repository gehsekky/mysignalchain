import { describe, expect, it } from "vitest";
import {
  buildSearchText,
  normalizeSearch,
  parseGearReference,
  slugify,
} from "./text";

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("Big Muff Pi")).toBe("big-muff-pi");
    expect(slugify("'65 Deluxe Reverb")).toBe("65-deluxe-reverb");
    expect(slugify("Ernie Ball & Co.")).toBe("ernie-ball-and-co");
    expect(slugify("Mötley Crüe")).toBe("motley-crue");
    expect(slugify("  --  ")).toBe("");
  });
});

describe("search text", () => {
  it("normalizes case and punctuation", () => {
    expect(normalizeSearch("SD-1  Super OverDrive!")).toBe(
      "sd 1 super overdrive",
    );
  });

  it("adds spaceless forms so 'ds1' finds 'DS-1'", () => {
    const text = buildSearchText("BOSS", "DS-1 Distortion", ["DS1"]);
    expect(text).toContain("boss");
    expect(text).toContain("ds 1 distortion");
    expect(text).toContain("ds1distortion");
    expect(text.split(" ")).toContain("ds1");
  });
});

describe("parseGearReference", () => {
  it("reads brand and model from short references and URLs", () => {
    const sd1 = { brand: "boss", model: "sd-1" };
    expect(parseGearReference("boss/sd-1")).toEqual(sd1);
    expect(parseGearReference(" /gear/boss/sd-1 ")).toEqual(sd1);
    expect(
      parseGearReference("https://mysignalchain.com/gear/boss/sd-1?x=1"),
    ).toEqual(sd1);
    expect(parseGearReference("boss")).toBeNull();
    expect(parseGearReference("")).toBeNull();
  });
});
