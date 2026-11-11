import Link from "next/link";
import { notFound } from "next/navigation";
import { Photo } from "@/components/photos/photo";
import { PhotoUploader } from "@/components/photos/uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { listPendingImages, uploadsMode } from "@/lib/images";
import { canModerateImages, canUploadImages } from "@/lib/policy";
import { approveImageAction, rejectImageAction } from "./actions";

export const metadata = { title: "Photo review · mysignalchain" };

// proxy.ts answers non-admins with a 404 before rendering; the page repeats
// the check and waits for it rather than streaming a fallback.
export const instant = false;

export default async function AdminImagesPage({
  searchParams,
}: PageProps<"/admin/images">) {
  const viewer = await getViewer();
  if (!canModerateImages(viewer)) notFound();
  const params = await searchParams;
  const message =
    typeof params.message === "string" ? params.message.slice(0, 200) : "";
  const pending = await listPendingImages(getDb());
  const uploads = canUploadImages(viewer, uploadsMode());

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Photo review</h1>
        <Link
          href="/admin/catalog"
          className="text-sm underline underline-offset-4"
        >
          Catalog review
        </Link>
      </div>
      {message && (
        <p role="status" className="bg-muted rounded-lg px-4 py-3 text-sm">
          {message}
        </p>
      )}

      {pending.length === 0 ? (
        <p className="text-muted-foreground">No photos waiting for review.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((image) => (
            <li
              key={image.id}
              aria-label={`Photo of ${image.brandName} ${image.modelName}`}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row"
            >
              <a href={`/api/images/${image.id}/${image.widths.at(-1)}.webp`}>
                <Photo
                  photo={{
                    ...image,
                    width: 0,
                    height: 0,
                    status: "pending",
                    reviewNote: null,
                  }}
                  alt={`Photo of ${image.brandName} ${image.modelName}`}
                  sizes="200px"
                  className="size-48 rounded-md object-contain"
                />
              </a>
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  <Link
                    href={`/gear/${image.brandSlug}/${image.slug}`}
                    className="font-medium hover:underline"
                  >
                    {image.brandName} {image.modelName}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · by @{image.uploaderHandle ?? "deleted user"} ·{" "}
                    {image.createdAt.toISOString().slice(0, 10)}
                    {image.offered && " · offered for the gear page"}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <form action={approveImageAction}>
                    <input type="hidden" name="imageId" value={image.id} />
                    <Button type="submit" size="sm">
                      Approve
                    </Button>
                  </form>
                  {image.offered && (
                    <form action={approveImageAction}>
                      <input type="hidden" name="imageId" value={image.id} />
                      <input type="hidden" name="gearPage" value="true" />
                      <Button type="submit" size="sm" variant="outline">
                        Approve and use on the gear page
                      </Button>
                    </form>
                  )}
                </div>
                <form action={rejectImageAction} className="flex gap-2">
                  <input type="hidden" name="imageId" value={image.id} />
                  <Input
                    name="note"
                    aria-label="Reason for rejecting"
                    placeholder="Reason (shown to the uploader)"
                    maxLength={500}
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Reject
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section
        aria-labelledby="cc"
        className="flex flex-col gap-3 border-t pt-6"
      >
        <h2 id="cc" className="text-lg font-semibold">
          Add a Creative Commons photo to a gear page
        </h2>
        <p className="text-muted-foreground text-sm">
          For example from Wikimedia Commons. Check the license allows reuse,
          and enter the author, license and link exactly as the source gives
          them; the gear page shows them under the photo.
        </p>
        {uploads ? (
          <PhotoUploader ccFields label="Photo" />
        ) : (
          <p className="text-muted-foreground text-sm">Uploads are off.</p>
        )}
      </section>
    </div>
  );
}
