import Link from "next/link";
import { Suspense } from "react";
import { CategoryIcon } from "@/components/gear/category-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listCategories,
  listGearInCategory,
  searchGear,
  type GearListItem,
} from "@/lib/catalog/queries";
import { getDb } from "@/lib/db/client";

export const metadata = {
  title: "Gear · mysignalchain",
  description:
    "Pedals, amps, cabs and more, with their jacks, power needs and signal paths.",
};

type Props = PageProps<"/gear">;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default function GearIndexPage({ searchParams }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Gear</h1>
          <p className="text-muted-foreground">
            Jacks, power needs and signal paths for gear you can put in a chain.
          </p>
        </div>
        <Link
          href="/gear/submit"
          className="text-sm underline underline-offset-4"
        >
          Missing something? Submit it
        </Link>
      </div>
      {/* Outside the boundary, so streaming results never replace it while
          someone is typing. */}
      <SearchForm />
      <Suspense>
        {searchParams.then((params) => (
          <Results query={first(params.q)} category={first(params.category)} />
        ))}
      </Suspense>
    </div>
  );
}

function SearchForm() {
  return (
    <form role="search" action="/gear" className="flex gap-2">
      <label htmlFor="q" className="sr-only">
        Search by brand or model
      </label>
      <Input
        id="q"
        name="q"
        type="search"
        placeholder="Search by brand or model, e.g. tube screamer"
        maxLength={100}
      />
      <Button type="submit">Search</Button>
    </form>
  );
}

async function Results({
  query,
  category,
}: {
  query: string;
  category: string;
}) {
  const db = getDb();

  if (query) {
    const results = await searchGear(db, query.slice(0, 100));
    return (
      <>
        <section aria-labelledby="results" className="flex flex-col gap-3">
          <h2 id="results" className="text-lg font-semibold">
            Results for “{query}”
          </h2>
          {results.length ? (
            <GearList items={results} />
          ) : (
            <p className="text-muted-foreground text-sm">
              Nothing matched. Check the spelling, try fewer words, or{" "}
              <Link
                href="/gear/submit"
                className="underline underline-offset-4"
              >
                submit it
              </Link>
              .
            </p>
          )}
        </section>
      </>
    );
  }

  const tree = await listCategories(db);

  if (category) {
    const items = await listGearInCategory(db, category);
    const top = tree.find((c) => c.slug === category);
    const child = tree
      .flatMap((c) => c.children)
      .find((c) => c.slug === category);
    const name = top?.name ?? child?.name;
    return (
      <>
        <section aria-labelledby="category" className="flex flex-col gap-3">
          <h2 id="category" className="text-lg font-semibold">
            {name ?? "Unknown category"}
          </h2>
          {items?.length ? (
            <GearList items={items} />
          ) : (
            <p className="text-muted-foreground text-sm">Nothing here yet.</p>
          )}
          <Link href="/gear" className="text-sm underline underline-offset-4">
            All categories
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <section aria-labelledby="browse" className="flex flex-col gap-4">
        <h2 id="browse" className="text-lg font-semibold">
          Browse
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {tree.map((top) => (
            <li key={top.slug} className="flex gap-3 rounded-lg border p-4">
              <CategoryIcon slug={top.slug} className="size-6 shrink-0" />
              <div className="flex flex-col gap-1">
                <Link
                  href={`/gear?category=${top.slug}`}
                  className="font-medium hover:underline"
                >
                  {top.name}
                </Link>
                <ul className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
                  {top.children
                    .filter((c) => c.count > 0)
                    .map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/gear?category=${c.slug}`}
                          className="hover:text-foreground"
                        >
                          {c.name} ({c.count})
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function GearList({ items }: { items: GearListItem[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/gear/${item.brandSlug}/${item.slug}`}
            className="hover:bg-muted flex items-baseline justify-between gap-4 px-4 py-3"
          >
            <span>
              <span className="text-muted-foreground">{item.brandName}</span>{" "}
              <span className="font-medium">{item.modelName}</span>
            </span>
            <span className="text-muted-foreground text-sm">
              {item.categoryName}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
