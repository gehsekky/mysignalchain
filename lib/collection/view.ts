/** What a viewer sees of a collection, applying lib/policy throughout. */
import type { Database } from "@/lib/db/client";
import { photosOfUnits, type Photo } from "@/lib/images";
import { canViewImage, canViewOwnedGear, type Viewer } from "@/lib/policy";
import { listOwnedGear, type OwnedGearRow } from "./index";

export type VisibleUnit = OwnedGearRow & {
  photos: (Photo & { offered: boolean })[];
};

/** Photos of a unit this viewer may see: all for the owner, else approved. */
export function visiblePhotos<T extends Photo>(
  viewer: Viewer | null,
  unit: { userId: string },
  photos: T[],
): T[] {
  return photos.filter((photo) =>
    canViewImage(
      viewer,
      { status: photo.status, uploaderId: unit.userId },
      true,
    ),
  );
}

export async function visibleCollection(
  db: Database,
  viewer: Viewer | null,
  userId: string,
): Promise<VisibleUnit[]> {
  const units = (await listOwnedGear(db, userId)).filter((unit) =>
    canViewOwnedGear(viewer, unit),
  );
  const photos = await photosOfUnits(
    db,
    units.map((u) => u.id),
  );
  return units.map((unit) => ({
    ...unit,
    photos: visiblePhotos(viewer, unit, photos.get(unit.id) ?? []),
  }));
}
