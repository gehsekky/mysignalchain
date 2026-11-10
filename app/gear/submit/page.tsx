import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { listCategories } from "@/lib/catalog/queries";
import { listSubmissions } from "@/lib/catalog/submit";
import { getDb } from "@/lib/db/client";
import { canSubmitGear } from "@/lib/policy";
import { SubmitForm } from "./submit-form";

export const metadata = { title: "Submit gear · mysignalchain" };

const STATUS = {
  pending: "Waiting for review",
  approved: "Added",
  rejected: "Not added",
  merged: "Merged with an existing item",
};

async function Submit() {
  const viewer = await getViewer();
  if (!canSubmitGear(viewer)) redirect(viewer ? "/onboarding" : "/sign-in");
  const db = getDb();
  const [categories, submissions] = [
    await listCategories(db),
    await listSubmissions(db, viewer!.id),
  ];

  return (
    <>
      <SubmitForm
        categories={categories.map((top) => ({
          name: top.name,
          children: top.children.map(({ slug, name }) => ({ slug, name })),
        }))}
      />
      {submissions.length > 0 && (
        <section aria-labelledby="mine" className="flex flex-col gap-3">
          <h2 id="mine" className="text-lg font-semibold">
            Your submissions
          </h2>
          <ul className="divide-y rounded-lg border text-sm">
            {submissions.map((s) => (
              <li
                key={`${s.brandSlug}/${s.slug}`}
                className="flex flex-wrap justify-between gap-2 px-4 py-3"
              >
                <Link
                  href={`/gear/${s.brandSlug}/${s.slug}`}
                  className="hover:underline"
                >
                  {s.brandName} {s.modelName}
                </Link>
                <span className="text-muted-foreground">
                  {STATUS[s.status]}
                  {s.status === "rejected" && s.reviewNote
                    ? `: ${s.reviewNote}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function SubmitGearPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Submit gear</h1>
        <p className="text-muted-foreground">
          Add something the catalog is missing. An admin checks each submission
          before it appears for everyone; until then only you can see it.
        </p>
      </div>
      <Suspense>
        <Submit />
      </Suspense>
    </div>
  );
}
