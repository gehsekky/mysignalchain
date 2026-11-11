import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { getGearItem } from "@/lib/catalog/queries";
import { parseGearReference } from "@/lib/catalog/text";
import { listFinishes } from "@/lib/collection";
import { getDb } from "@/lib/db/client";
import { canEditOwnProfile, canViewGearItem } from "@/lib/policy";
import { addUnitAction } from "../actions";
import { UnitForm } from "../unit-form";

export const metadata = { title: "Add to my gear · mysignalchain" };

async function Add({ searchParams }: PageProps<"/collection/add">) {
  const viewer = await getViewer();
  if (!canEditOwnProfile(viewer)) redirect(viewer ? "/onboarding" : "/sign-in");
  const { gear } = await searchParams;
  const reference = parseGearReference(String(gear ?? ""));
  const db = getDb();
  const item = reference
    ? await getGearItem(db, reference.brand, reference.model)
    : null;
  if (
    !item ||
    !canViewGearItem(viewer, item) ||
    item.status === "rejected" ||
    item.status === "merged"
  ) {
    return (
      <p className="text-muted-foreground">
        That item wasn&apos;t found.{" "}
        <Link href="/gear" className="underline underline-offset-4">
          Search the catalog
        </Link>
        .
      </p>
    );
  }
  const name = `${item.brand.name} ${item.modelName}`;
  return (
    <>
      <p>
        Adding{" "}
        <Link
          href={`/gear/${item.brand.slug}/${item.slug}`}
          className="font-medium underline underline-offset-4"
        >
          {name}
        </Link>
        . You can add photos next.
      </p>
      <UnitForm
        action={addUnitAction}
        hidden={{ brand: item.brand.slug, model: item.slug }}
        finishes={await listFinishes(db, item.id)}
        defaults={{
          status: "owned",
          finish: "",
          customFinish: "",
          nickname: "",
          mods: "",
          notes: "",
          public: false,
        }}
        submitLabel="Add to my gear"
      />
    </>
  );
}

export default function AddUnitPage(props: PageProps<"/collection/add">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Add to my gear</h1>
      <Suspense>
        <Add {...props} />
      </Suspense>
    </div>
  );
}
