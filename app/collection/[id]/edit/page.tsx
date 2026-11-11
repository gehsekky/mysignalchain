import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Photo } from "@/components/photos/photo";
import { PhotoUploader } from "@/components/photos/uploader";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/viewer";
import { getOwnedGear, listFinishes } from "@/lib/collection";
import { getDb } from "@/lib/db/client";
import { MAX_PHOTOS_PER_UNIT, photosOfUnits, uploadsMode } from "@/lib/images";
import {
  canEditOwnedGear,
  canEditOwnProfile,
  canUploadImages,
} from "@/lib/policy";
import {
  deletePhotoAction,
  removeUnitAction,
  setOfferedAction,
  updateUnitAction,
} from "../../actions";
import { UnitForm } from "../../unit-form";

export const metadata = { title: "Edit gear · mysignalchain" };

// Other people get a 404; the page waits for that check.
export const instant = false;

export default async function EditUnitPage({
  params,
  searchParams,
}: PageProps<"/collection/[id]/edit">) {
  const viewer = await getViewer();
  if (!canEditOwnProfile(viewer)) redirect(viewer ? "/onboarding" : "/sign-in");
  const { id } = await params;
  const { added } = await searchParams;
  const db = getDb();
  const unit = await getOwnedGear(db, id);
  if (!unit || !canEditOwnedGear(viewer, unit)) notFound();

  const [finishes, photos] = await Promise.all([
    listFinishes(db, unit.gearItem.id),
    photosOfUnits(db, [unit.id]).then((m) => m.get(unit.id) ?? []),
  ]);
  const name = `${unit.gearItem.brandName} ${unit.gearItem.modelName}`;
  const uploads = canUploadImages(viewer, uploadsMode());

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          {unit.nickname ?? name}
        </h1>
        <Link
          href={`/u/${viewer!.handle}/gear/${unit.id}`}
          className="text-sm underline underline-offset-4"
        >
          View
        </Link>
      </div>
      {added && (
        <p role="status" className="bg-muted rounded-lg px-4 py-3 text-sm">
          Added to your gear. It&apos;s private until you choose to show it on
          your profile.
        </p>
      )}

      <section aria-labelledby="photos" className="flex flex-col gap-4">
        <h2 id="photos" className="text-lg font-semibold">
          Photos
        </h2>
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {photos.map((photo, i) => (
              <li key={photo.id} className="flex flex-col gap-2 text-xs">
                <Photo
                  photo={photo}
                  alt={`${name}, photo ${i + 1}`}
                  sizes="200px"
                  className="aspect-square w-full rounded-lg"
                />
                <span
                  className={
                    photo.status === "rejected"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {photo.status === "pending" && "Waiting for review"}
                  {photo.status === "approved" && "Approved"}
                  {photo.status === "rejected" &&
                    `Not approved${photo.reviewNote ? `: ${photo.reviewNote}` : ""}`}
                </span>
                {photo.status !== "rejected" && (
                  <form action={setOfferedAction}>
                    <input type="hidden" name="unitId" value={unit.id} />
                    <input type="hidden" name="imageId" value={photo.id} />
                    <input
                      type="hidden"
                      name="offered"
                      value={String(!photo.offered)}
                    />
                    <button
                      type="submit"
                      className="underline underline-offset-4"
                    >
                      {photo.offered
                        ? "Withdraw from the gear page"
                        : "Offer for the gear page"}
                    </button>
                  </form>
                )}
                <form action={deletePhotoAction}>
                  <input type="hidden" name="unitId" value={unit.id} />
                  <input type="hidden" name="imageId" value={photo.id} />
                  <button
                    type="submit"
                    className="text-destructive underline underline-offset-4"
                  >
                    Delete photo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {!uploads ? (
          <p className="text-muted-foreground text-sm">
            Photo uploads open soon.
          </p>
        ) : photos.length >= MAX_PHOTOS_PER_UNIT ? (
          <p className="text-muted-foreground text-sm">
            Each item can have up to {MAX_PHOTOS_PER_UNIT} photos.
          </p>
        ) : (
          <PhotoUploader
            request={{ kind: "owned", ownedGearId: unit.id }}
            offerOption={unit.gearItem.status === "approved"}
          />
        )}
      </section>

      <section aria-labelledby="details" className="flex flex-col gap-4">
        <h2 id="details" className="text-lg font-semibold">
          Details
        </h2>
        <UnitForm
          action={updateUnitAction}
          hidden={{ id: unit.id }}
          finishes={finishes}
          defaults={{
            status: unit.status,
            finish: unit.finishId ?? (unit.customFinish ? "other" : ""),
            customFinish: unit.customFinish ?? "",
            nickname: unit.nickname ?? "",
            mods: unit.mods ?? "",
            notes: unit.notes ?? "",
            public: unit.visibility === "public",
          }}
          submitLabel="Save"
        />
      </section>

      <section
        aria-labelledby="remove"
        className="flex flex-col gap-3 border-t pt-6"
      >
        <h2 id="remove" className="text-lg font-semibold">
          Remove
        </h2>
        <p className="text-muted-foreground text-sm">
          Removes this item and deletes its photos. This can&apos;t be undone.
        </p>
        <form action={removeUnitAction}>
          <input type="hidden" name="id" value={unit.id} />
          <Button type="submit" variant="destructive" size="sm">
            Remove from my gear
          </Button>
        </form>
      </section>
    </div>
  );
}
