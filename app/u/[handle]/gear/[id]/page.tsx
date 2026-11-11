import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/gear/category-icon";
import { Photo } from "@/components/photos/photo";
import { getViewer } from "@/lib/auth/viewer";
import { getOwnedGear } from "@/lib/collection";
import { visiblePhotos } from "@/lib/collection/view";
import { getDb } from "@/lib/db/client";
import { photosOfUnits } from "@/lib/images";
import { canEditOwnedGear, canViewOwnedGear } from "@/lib/policy";
import { getProfile } from "@/lib/profile";

// proxy.ts answers private and missing units with a 404 before rendering.
export const instant = false;

type Props = PageProps<"/u/[handle]/gear/[id]">;

async function loadUnit(params: Props["params"]) {
  const { handle, id } = await params;
  const db = getDb();
  const [profile, unit, viewer] = await Promise.all([
    getProfile(db, handle),
    getOwnedGear(db, id),
    getViewer(),
  ]);
  if (!profile || !unit || unit.userId !== profile.id) notFound();
  if (!canViewOwnedGear(viewer, unit)) notFound();
  return { profile, unit, viewer };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profile, unit } = await loadUnit(params);
  const name = `${unit.gearItem.brandName} ${unit.gearItem.modelName}`;
  return {
    title: `${unit.nickname ?? name} · @${profile.handle} · mysignalchain`,
    description: `@${profile.handle}'s ${name}.`,
  };
}

const STATUS = { owned: "Owned", wishlist: "On the wishlist", sold: "Sold" };

export default async function UnitPage({ params }: Props) {
  const { profile, unit, viewer } = await loadUnit(params);
  const canEdit = canEditOwnedGear(viewer, unit);
  const photos = visiblePhotos(
    viewer,
    unit,
    (await photosOfUnits(getDb(), [unit.id])).get(unit.id) ?? [],
  );
  const name = `${unit.gearItem.brandName} ${unit.gearItem.modelName}`;
  const finish = unit.finishName ?? unit.customFinish;
  const gearHref = `/gear/${unit.gearItem.brandSlug}/${unit.gearItem.slug}`;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link href={`/u/${profile.handle}`} className="hover:text-foreground">
          @{profile.handle}
        </Link>
        {" / gear"}
      </nav>

      <header className="flex items-start gap-5">
        {photos.length === 0 && (
          <div className="bg-muted flex size-24 shrink-0 items-center justify-center rounded-xl">
            <CategoryIcon
              slug={unit.gearItem.topCategorySlug}
              className="size-12"
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {unit.nickname ?? name}
          </h1>
          <p className="text-muted-foreground text-sm">
            <Link href={gearHref} className="underline underline-offset-4">
              {name}
            </Link>
            {finish ? ` · ${finish}` : ""} · {STATUS[unit.status]}
          </p>
          {canEdit && (
            <p className="flex gap-4 pt-1 text-sm">
              <span className="text-muted-foreground">
                {unit.visibility === "private"
                  ? "Private: only you can see this"
                  : "Public"}
              </span>
              <Link
                href={`/collection/${unit.id}/edit`}
                className="underline underline-offset-4"
              >
                Edit
              </Link>
            </p>
          )}
        </div>
      </header>

      {photos.length > 0 && (
        <section aria-label="Photos" className="flex flex-col gap-3">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, i) => (
              <li key={photo.id} className="flex flex-col gap-1">
                <Photo
                  photo={photo}
                  alt={`${name}, photo ${i + 1}`}
                  sizes="(min-width: 640px) 240px, 50vw"
                  className="aspect-square w-full rounded-lg"
                />
                {photo.status === "pending" && (
                  <span className="text-muted-foreground text-xs">
                    Waiting for review; only you can see it
                  </span>
                )}
                {photo.status === "rejected" && (
                  <span className="text-destructive text-xs">
                    Not approved
                    {photo.reviewNote ? `: ${photo.reviewNote}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {unit.mods && (
        <section aria-labelledby="mods" className="flex flex-col gap-2">
          <h2 id="mods" className="text-lg font-semibold">
            Mods
          </h2>
          <p className="text-sm whitespace-pre-line">{unit.mods}</p>
        </section>
      )}
      {unit.notes && (
        <section aria-labelledby="notes" className="flex flex-col gap-2">
          <h2 id="notes" className="text-lg font-semibold">
            Notes
          </h2>
          <p className="text-sm whitespace-pre-line">{unit.notes}</p>
        </section>
      )}
    </article>
  );
}
