/**
 * Decides, before a profile page renders, whether it's a 404, a redirect or
 * fine to show, like lib/catalog/access.ts does for gear pages.
 *
 * - `/u/{old-handle}/...` redirects to the current handle.
 * - `/u/{handle}/gear/{id}` is a 404 unless the unit belongs to that user
 *   and canViewOwnedGear allows this viewer.
 */
import type { Database } from "@/lib/db/client";
import { getOwnedGear } from "@/lib/collection";
import type { GearAccess } from "@/lib/catalog/access";
import { resolveOldHandle } from "@/lib/handles/change";
import { canViewOwnedGear, type Viewer } from "@/lib/policy";
import { getProfile } from "./index";

export async function checkProfileAccess(
  db: Database,
  segments: string[],
  loadViewer: () => Promise<Viewer | null>,
): Promise<GearAccess> {
  const [handle, section, id, ...extra] = segments;
  if (!handle || extra.length > 0) return { kind: "not-found" };
  if (section !== undefined && section !== "gear") return { kind: "not-found" };
  if (section === "gear" && !id) return { kind: "not-found" };

  const profile = await getProfile(db, handle);
  if (!profile) {
    const current = await resolveOldHandle(db, handle);
    return current
      ? {
          kind: "redirect",
          to: `/u/${[current, ...segments.slice(1)].join("/")}`,
        }
      : { kind: "not-found" };
  }
  if (profile.handle !== handle) {
    return {
      kind: "redirect",
      to: `/u/${[profile.handle, ...segments.slice(1)].join("/")}`,
    };
  }
  if (!id) return { kind: "show" };

  const unit = await getOwnedGear(db, id);
  if (!unit || unit.userId !== profile.id) return { kind: "not-found" };
  return canViewOwnedGear(await loadViewer(), unit)
    ? { kind: "show" }
    : { kind: "not-found" };
}
