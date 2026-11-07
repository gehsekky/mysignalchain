import { describe, expect, it } from "vitest";
import { handleSchema, isBlockedHandle } from "./index";

describe("handleSchema", () => {
  it.each([
    ["andy", "andy"],
    ["  Andy ", "andy"],
    ["tone-chaser-99", "tone-chaser-99"],
    ["abc", "abc"],
    ["a".repeat(30), "a".repeat(30)],
  ])("accepts %j", (input, expected) => {
    expect(handleSchema.parse(input)).toBe(expected);
  });

  it.each([
    "ab",
    "a".repeat(31),
    "-andy",
    "andy-",
    "an--dy",
    "an_dy",
    "an dy",
    "ándy",
    "admin",
    "Admin",
    "my-signal-chain",
    "",
  ])("rejects %j", (input) => {
    expect(handleSchema.safeParse(input).success).toBe(false);
  });
});

describe("isBlockedHandle", () => {
  it("allows ordinary names that only contain a blocked word", () => {
    expect(isBlockedHandle("admiral")).toBe(false);
    expect(isBlockedHandle("support-act")).toBe(false);
  });
});
