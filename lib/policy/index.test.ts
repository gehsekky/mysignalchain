import { describe, expect, it } from "vitest";
import { canUseAccountFeatures, type Viewer } from "./index";

const finished: Viewer = {
  id: "1",
  handle: "andy",
  ageCheckPassedAt: new Date(),
};

describe("canUseAccountFeatures", () => {
  it("allows a user who finished onboarding", () => {
    expect(canUseAccountFeatures(finished)).toBe(true);
  });

  it("blocks anonymous visitors", () => {
    expect(canUseAccountFeatures(null)).toBe(false);
  });

  it("blocks a user with no handle or no age check", () => {
    expect(canUseAccountFeatures({ ...finished, handle: null })).toBe(false);
    expect(canUseAccountFeatures({ ...finished, ageCheckPassedAt: null })).toBe(
      false,
    );
  });
});
