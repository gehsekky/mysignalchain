import { describe, expect, it } from "vitest";
import {
  canModerateCatalog,
  canSubmitGear,
  canUseAccountFeatures,
  canViewGearItem,
  type Viewer,
} from "./index";

const finished: Viewer = {
  id: "1",
  handle: "andy",
  ageCheckPassedAt: new Date(),
  role: "user",
};
const admin: Viewer = { ...finished, id: "admin", role: "admin" };
const unfinishedAdmin: Viewer = { ...admin, handle: null };

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

describe("canViewGearItem", () => {
  const mine = { createdBy: finished.id };
  const theirs = { createdBy: "someone-else" };

  it("shows approved and merged items to everyone", () => {
    for (const status of ["approved", "merged"] as const) {
      expect(canViewGearItem(null, { status, ...theirs })).toBe(true);
    }
  });

  it("shows pending and rejected items only to the submitter and admins", () => {
    for (const status of ["pending", "rejected"] as const) {
      expect(canViewGearItem(finished, { status, ...mine })).toBe(true);
      expect(canViewGearItem(admin, { status, ...theirs })).toBe(true);
      expect(canViewGearItem(finished, { status, ...theirs })).toBe(false);
      expect(canViewGearItem(null, { status, ...theirs })).toBe(false);
      expect(canViewGearItem(null, { status, createdBy: null })).toBe(false);
    }
  });

  it("requires finished onboarding, even for the submitter or an admin", () => {
    const status = "pending";
    expect(
      canViewGearItem({ ...finished, handle: null }, { status, ...mine }),
    ).toBe(false);
    expect(canViewGearItem(unfinishedAdmin, { status, ...theirs })).toBe(false);
  });
});

describe("catalog submissions and moderation", () => {
  it("lets any onboarded user submit", () => {
    expect(canSubmitGear(finished)).toBe(true);
    expect(canSubmitGear(null)).toBe(false);
    expect(canSubmitGear({ ...finished, ageCheckPassedAt: null })).toBe(false);
  });

  it("lets only onboarded admins moderate", () => {
    expect(canModerateCatalog(admin)).toBe(true);
    expect(canModerateCatalog(finished)).toBe(false);
    expect(canModerateCatalog(unfinishedAdmin)).toBe(false);
    expect(canModerateCatalog(null)).toBe(false);
  });
});
