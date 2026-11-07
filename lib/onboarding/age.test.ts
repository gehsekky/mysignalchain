import { describe, expect, it } from "vitest";
import { isOldEnough } from "./age";

const now = new Date("2026-11-07T12:00:00Z");

describe("isOldEnough", () => {
  it("passes someone clearly older than 13", () => {
    expect(isOldEnough(1985, 6, now)).toBe(true);
  });

  it("passes the month after a 13th birthday month", () => {
    expect(isOldEnough(2013, 10, now)).toBe(true);
  });

  it("fails during the 13th birthday month", () => {
    expect(isOldEnough(2013, 11, now)).toBe(false);
  });

  it("fails someone younger than 13", () => {
    expect(isOldEnough(2013, 12, now)).toBe(false);
    expect(isOldEnough(2020, 1, now)).toBe(false);
  });
});
