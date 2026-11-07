/** All permission checks live here. No ad hoc checks in pages. */

export type Viewer = {
  id: string;
  handle: string | null;
  ageCheckPassedAt: Date | null;
};

export function hasFinishedOnboarding(viewer: Viewer): boolean {
  return viewer.handle !== null && viewer.ageCheckPassedAt !== null;
}

/** Until onboarding is finished, everything except onboarding is blocked. */
export function canUseAccountFeatures(viewer: Viewer | null): boolean {
  return viewer !== null && hasFinishedOnboarding(viewer);
}
