/** All permission checks live here. No ad hoc checks in pages. */

export type Viewer = {
  id: string;
  handle: string | null;
  ageCheckPassedAt: Date | null;
  role: "user" | "admin";
};

export function hasFinishedOnboarding(viewer: Viewer): boolean {
  return viewer.handle !== null && viewer.ageCheckPassedAt !== null;
}

/** Until onboarding is finished, everything except onboarding is blocked. */
export function canUseAccountFeatures(viewer: Viewer | null): boolean {
  return viewer !== null && hasFinishedOnboarding(viewer);
}

function isAdmin(viewer: Viewer | null): boolean {
  return canUseAccountFeatures(viewer) && viewer!.role === "admin";
}

// ---------------------------------------------------------------------------
// Gear catalog
// ---------------------------------------------------------------------------

export type GearItemAccess = {
  status: "pending" | "approved" | "rejected" | "merged";
  createdBy: string | null;
};

/**
 * Approved items are public. Merged items are too; their pages redirect to
 * the item they were merged into. Pending and rejected items are visible only
 * to their submitter and admins; everyone else gets a 404.
 */
export function canViewGearItem(
  viewer: Viewer | null,
  item: GearItemAccess,
): boolean {
  if (item.status === "approved" || item.status === "merged") return true;
  if (isAdmin(viewer)) return true;
  return (
    canUseAccountFeatures(viewer) &&
    item.createdBy !== null &&
    item.createdBy === viewer!.id
  );
}

export function canSubmitGear(viewer: Viewer | null): boolean {
  return canUseAccountFeatures(viewer);
}

/** Approve, reject and merge catalog items. */
export function canModerateCatalog(viewer: Viewer | null): boolean {
  return isAdmin(viewer);
}

// ---------------------------------------------------------------------------
// Profiles and collections
// ---------------------------------------------------------------------------

export type OwnedGearAccess = {
  userId: string;
  visibility: "private" | "public";
  /** The catalog item it points at; pending ones stay hidden from others. */
  gearItem: GearItemAccess;
};

/** Edit profile, change handle, add to and edit one's own collection. */
export function canEditOwnProfile(viewer: Viewer | null): boolean {
  return canUseAccountFeatures(viewer);
}

function isOwner(viewer: Viewer | null, userId: string): boolean {
  return canUseAccountFeatures(viewer) && viewer!.id === userId;
}

/**
 * Owners see everything in their collection. Everyone else sees only public
 * units of public catalog items; a private unit returns a 404, so others
 * can't tell it exists.
 */
export function canViewOwnedGear(
  viewer: Viewer | null,
  owned: OwnedGearAccess,
): boolean {
  if (isOwner(viewer, owned.userId)) return true;
  return (
    owned.visibility === "public" &&
    (owned.gearItem.status === "approved" || owned.gearItem.status === "merged")
  );
}

export function canEditOwnedGear(
  viewer: Viewer | null,
  owned: { userId: string },
): boolean {
  return isOwner(viewer, owned.userId);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Who may upload photos. `admins` lets the site's admins test uploads in
 * production before they open to everyone (see docs/PLAN.md, M2).
 */
export type UploadsMode = "off" | "admins" | "on";

export function canUploadImages(
  viewer: Viewer | null,
  mode: UploadsMode,
): boolean {
  if (mode === "on") return canUseAccountFeatures(viewer);
  if (mode === "admins") return isAdmin(viewer);
  return false;
}

export type ImageAccess = {
  status: "pending" | "approved" | "rejected";
  uploaderId: string | null;
};

/**
 * Pending and rejected photos are seen only by their uploader and admins.
 * An approved photo is seen by anyone who can see what it's attached to;
 * `attachedVisible` says whether this viewer can.
 */
export function canViewImage(
  viewer: Viewer | null,
  image: ImageAccess,
  attachedVisible: boolean,
): boolean {
  if (isAdmin(viewer)) return true;
  if (image.uploaderId !== null && isOwner(viewer, image.uploaderId)) {
    return attachedVisible;
  }
  return image.status === "approved" && attachedVisible;
}

/** Approve or reject photos and choose gear page photos. */
export function canModerateImages(viewer: Viewer | null): boolean {
  return isAdmin(viewer);
}
