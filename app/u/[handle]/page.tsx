import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/gear/category-icon";
import { Photo } from "@/components/photos/photo";
import { LetterAvatar } from "@/components/letter-avatar";
import { getViewer } from "@/lib/auth/viewer";
import { OWNED_STATUSES, type OwnedStatus } from "@/lib/collection";
import { visibleCollection, type VisibleUnit } from "@/lib/collection/view";
import { getDb } from "@/lib/db/client";
import { getProfile } from "@/lib/profile";

// proxy.ts answers unknown handles with a 404 and old ones with a 308
// before rendering; the page waits for its checks rather than streaming.
export const instant = false;

type Props = PageProps<"/u/[handle]">;

async function loadProfile(params: Props["params"]) {
  const { handle } = await params;
  const profile = await getProfile(getDb(), handle);
  if (!profile) notFound();
  return profile;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile(params);
  return {
    title: `${profile.displayName} (@${profile.handle}) · mysignalchain`,
    description: profile.bio ?? `@${profile.handle}'s gear on mysignalchain.`,
  };
}

const SECTIONS: Record<OwnedStatus, string> = {
  owned: "Gear",
  wishlist: "Wishlist",
  sold: "Sold",
};

export default async function ProfilePage({ params }: Props) {
  const profile = await loadProfile(params);
  const viewer = await getViewer();
  const isOwner = viewer?.id === profile.id;
  const units = await visibleCollection(getDb(), viewer, profile.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex items-start gap-5">
        <LetterAvatar name={profile.displayName} className="size-16 text-2xl" />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {profile.displayName}
          </h1>
          <p className="text-muted-foreground text-sm">
            @{profile.handle} · joined{" "}
            {profile.joinedAt.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </p>
          {profile.bio && <p className="pt-1">{profile.bio}</p>}
          {isOwner && (
            <Link
              href="/settings"
              className="text-sm underline underline-offset-4"
            >
              Edit profile
            </Link>
          )}
        </div>
      </header>

      {units.length === 0 && (
        <p className="text-muted-foreground">
          {isOwner ? (
            <>
              Nothing here yet.{" "}
              <Link href="/gear" className="underline underline-offset-4">
                Find your gear
              </Link>{" "}
              and choose &ldquo;Add to my gear&rdquo;.
            </>
          ) : (
            "No public gear yet."
          )}
        </p>
      )}

      {OWNED_STATUSES.map((status) => {
        const list = units.filter((u) => u.status === status);
        if (list.length === 0) return null;
        return (
          <section
            key={status}
            aria-labelledby={`section-${status}`}
            className="flex flex-col gap-3"
          >
            <h2 id={`section-${status}`} className="text-lg font-semibold">
              {SECTIONS[status]}{" "}
              <span className="text-muted-foreground font-normal">
                ({list.length})
              </span>
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {list.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  handle={profile.handle}
                  isOwner={isOwner}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {isOwner && units.length > 0 && (
        <p className="text-muted-foreground text-sm">
          To add more, find the gear in the{" "}
          <Link href="/gear" className="underline underline-offset-4">
            catalog
          </Link>{" "}
          and choose &ldquo;Add to my gear&rdquo;.
        </p>
      )}
    </div>
  );
}

function UnitCard({
  unit,
  handle,
  isOwner,
}: {
  unit: VisibleUnit;
  handle: string;
  isOwner: boolean;
}) {
  const name = `${unit.gearItem.brandName} ${unit.gearItem.modelName}`;
  const cover = unit.photos.find((p) => p.status !== "rejected");
  const finish = unit.finishName ?? unit.customFinish;
  return (
    <li className="overflow-hidden rounded-lg border">
      <Link
        href={`/u/${handle}/gear/${unit.id}`}
        className="group flex gap-4 p-3"
      >
        {cover ? (
          <Photo
            photo={cover}
            alt=""
            sizes="96px"
            className="size-24 shrink-0 rounded-md"
          />
        ) : (
          <div className="bg-muted flex size-24 shrink-0 items-center justify-center rounded-md">
            <CategoryIcon
              slug={unit.gearItem.topCategorySlug}
              className="size-10"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium group-hover:underline">
            {unit.nickname ?? name}
          </span>
          {unit.nickname && (
            <span className="text-muted-foreground text-sm">{name}</span>
          )}
          {finish && (
            <span className="text-muted-foreground text-sm">{finish}</span>
          )}
          {isOwner && unit.visibility === "private" && (
            <span className="text-muted-foreground text-xs">Private</span>
          )}
          {isOwner && unit.gearItem.status === "pending" && (
            <span className="text-muted-foreground text-xs">
              Catalog entry waiting for review
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
