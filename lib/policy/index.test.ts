import { describe, expect, it } from "vitest";
import {
  canEditOwnedGear,
  canModerateCatalog,
  canModerateImages,
  canUploadImages,
  canViewImage,
  canViewOwnedGear,
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

describe("canViewOwnedGear", () => {
  const approved = { status: "approved" as const, createdBy: null };
  const pending = { status: "pending" as const, createdBy: finished.id };
  const unit = (
    visibility: "private" | "public",
    gearItem: typeof approved | typeof pending = approved,
  ) => ({ userId: finished.id, visibility, gearItem });

  it("shows owners everything in their collection", () => {
    expect(canViewOwnedGear(finished, unit("private"))).toBe(true);
    expect(canViewOwnedGear(finished, unit("public", pending))).toBe(true);
  });

  it("hides private units from everyone else, admins included", () => {
    expect(canViewOwnedGear(null, unit("private"))).toBe(false);
    expect(canViewOwnedGear(admin, unit("private"))).toBe(false);
  });

  it("shows public units of public catalog items to anyone", () => {
    expect(canViewOwnedGear(null, unit("public"))).toBe(true);
  });

  it("hides public units of pending catalog items from others", () => {
    expect(canViewOwnedGear(null, unit("public", pending))).toBe(false);
  });

  it("doesn't treat an unfinished account as the owner", () => {
    expect(
      canViewOwnedGear({ ...finished, handle: null }, unit("private")),
    ).toBe(false);
  });

  it("lets only the owner edit", () => {
    expect(canEditOwnedGear(finished, { userId: finished.id })).toBe(true);
    expect(canEditOwnedGear(admin, { userId: finished.id })).toBe(false);
    expect(canEditOwnedGear(null, { userId: finished.id })).toBe(false);
  });
});

describe("canUploadImages", () => {
  it("follows the uploads switch", () => {
    expect(canUploadImages(finished, "on")).toBe(true);
    expect(canUploadImages(finished, "admins")).toBe(false);
    expect(canUploadImages(admin, "admins")).toBe(true);
    expect(canUploadImages(admin, "off")).toBe(false);
    expect(canUploadImages(null, "on")).toBe(false);
  });
});

describe("canViewImage", () => {
  const image = (status: "pending" | "approved" | "rejected") => ({
    status,
    uploaderId: finished.id,
  });
  const other: Viewer = { ...finished, id: "2", handle: "other" };

  it("shows pending and rejected photos only to the uploader and admins", () => {
    for (const status of ["pending", "rejected"] as const) {
      expect(canViewImage(finished, image(status), true)).toBe(true);
      expect(canViewImage(admin, image(status), true)).toBe(true);
      expect(canViewImage(other, image(status), true)).toBe(false);
      expect(canViewImage(null, image(status), true)).toBe(false);
    }
  });

  it("shows approved photos to whoever can see what they're attached to", () => {
    expect(canViewImage(null, image("approved"), true)).toBe(true);
    expect(canViewImage(null, image("approved"), false)).toBe(false);
  });

  it("lets only admins moderate", () => {
    expect(canModerateImages(admin)).toBe(true);
    expect(canModerateImages(finished)).toBe(false);
  });
});
