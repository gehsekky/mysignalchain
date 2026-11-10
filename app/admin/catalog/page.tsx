import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getViewer } from "@/lib/auth/viewer";
import { listPending } from "@/lib/catalog/moderate";
import { getDb } from "@/lib/db/client";
import { canModerateCatalog } from "@/lib/policy";
import { approveAction, mergeAction, rejectAction } from "./actions";

export const metadata = { title: "Catalog review · mysignalchain" };

// proxy.ts answers non-admins with a 404 before rendering; the page repeats
// the check and waits for it rather than streaming a fallback.
export const instant = false;

async function Queue({ message }: { message: string }) {
  const pending = await listPending(getDb());

  return (
    <>
      {message && (
        <p role="status" className="bg-muted rounded-lg px-4 py-3 text-sm">
          {message}
        </p>
      )}
      {pending.length === 0 ? (
        <p className="text-muted-foreground">Nothing waiting for review.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border p-4"
              aria-label={`${item.brandName} ${item.modelName}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/gear/${item.brandSlug}/${item.slug}`}
                  className="font-medium hover:underline"
                >
                  {item.brandName} {item.modelName}
                </Link>
                <span className="text-muted-foreground text-sm">
                  {item.categoryName} · by @{item.submittedBy ?? "deleted user"}{" "}
                  · {item.createdAt.toISOString().slice(0, 10)}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <form action={approveAction}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <Button type="submit" size="sm">
                    Approve
                  </Button>
                </form>
                <form action={rejectAction} className="flex gap-2">
                  <input type="hidden" name="itemId" value={item.id} />
                  <Input
                    name="note"
                    aria-label="Reason for rejecting"
                    placeholder="Reason (shown to the submitter)"
                    maxLength={500}
                    className="w-56"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Reject
                  </Button>
                </form>
                <form action={mergeAction} className="flex gap-2">
                  <input type="hidden" name="itemId" value={item.id} />
                  <Input
                    name="target"
                    aria-label="Merge into"
                    placeholder="Merge into, e.g. boss/sd-1"
                    required
                    className="w-48"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Merge
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default async function CatalogReviewPage({
  searchParams,
}: PageProps<"/admin/catalog">) {
  if (!canModerateCatalog(await getViewer())) notFound();
  const params = await searchParams;
  const message =
    typeof params.message === "string" ? params.message.slice(0, 200) : "";
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Catalog review</h1>
      <Queue message={message} />
    </div>
  );
}
