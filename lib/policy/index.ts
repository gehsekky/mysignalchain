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
