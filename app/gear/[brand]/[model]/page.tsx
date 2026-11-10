import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CategoryIcon } from "@/components/gear/category-icon";
import { getViewer } from "@/lib/auth/viewer";
import {
  describePortSpec,
  describeSpecs,
  SIGNAL_TYPE_NAMES,
  SIGNAL_TYPE_ORDER,
} from "@/lib/catalog/describe";
import {
  getGearItem,
  resolveMergeTarget,
  type GearItemPage,
} from "@/lib/catalog/queries";
import { getDb } from "@/lib/db/client";
import { canViewGearItem } from "@/lib/policy";

// proxy.ts already answers missing and hidden items with a 404 and merged
// ones with a 308, before rendering. The page repeats the checks (for
// example during client-side navigation) and waits for them rather than
// streaming a fallback.
export const instant = false;

type Props = PageProps<"/gear/[brand]/[model]">;

/** The item if this viewer may see it; redirects merged items. */
async function loadItem(params: Props["params"]) {
  const { brand, model } = await params;
  const db = getDb();
  const [viewer, item] = await Promise.all([
    getViewer(),
    getGearItem(db, brand, model),
  ]);
  if (!item || !canViewGearItem(viewer, item)) notFound();
  if (item.status === "merged" && item.mergedIntoId) {
    const target = await resolveMergeTarget(db, item.mergedIntoId);
    if (!target) notFound();
    permanentRedirect(`/gear/${target.brandSlug}/${target.slug}`);
  }
  return item;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await loadItem(params);
  const name = `${item.brand.name} ${item.modelName}`;
  return {
    title: `${name} · mysignalchain`,
    description: `Jacks, power and specs for the ${name} (${item.category.name.toLowerCase()}).`,
  };
}

export default async function GearPage({ params }: Props) {
  const item = await loadItem(params);
  const specs = describeSpecs(item.specs);

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link href="/gear" className="hover:text-foreground">
          Gear
        </Link>
        {" / "}
        <Link
          href={`/gear?category=${item.topCategory.slug}`}
          className="hover:text-foreground"
        >
          {item.topCategory.name}
        </Link>
        {item.topCategory.slug !== item.category.slug && (
          <>
            {" / "}
            <Link
              href={`/gear?category=${item.category.slug}`}
              className="hover:text-foreground"
            >
              {item.category.name}
            </Link>
          </>
        )}
      </nav>

      <header className="flex items-start gap-5">
        <div className="bg-muted flex size-24 shrink-0 items-center justify-center rounded-xl">
          <CategoryIcon slug={item.topCategory.slug} className="size-12" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">{item.brand.name}</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {item.modelName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {item.category.name}
            {item.years ? ` · ${item.years}` : ""}
          </p>
          {item.variantOf && (
            <p className="text-sm">
              A variant of{" "}
              <Link
                className="underline underline-offset-4"
                href={`/gear/${item.variantOf.brandSlug}/${item.variantOf.slug}`}
              >
                {item.variantOf.brandName} {item.variantOf.modelName}
              </Link>
            </p>
          )}
        </div>
      </header>

      <StatusNote item={item} />

      {item.aliases.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Also known as </span>
          {item.aliases.join(", ")}
        </p>
      )}

      {(specs.length > 0 || item.specs.notes) && (
        <section aria-labelledby="specs" className="flex flex-col gap-3">
          <h2 id="specs" className="text-lg font-semibold">
            Specs
          </h2>
          {specs.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              {specs.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {item.specs.notes && <p className="text-sm">{item.specs.notes}</p>}
        </section>
      )}

      {item.finishes.length > 0 && (
        <section aria-labelledby="finishes" className="flex flex-col gap-3">
          <h2 id="finishes" className="text-lg font-semibold">
            Finishes
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {item.finishes.map((finish) => (
              <li key={finish} className="bg-muted rounded-full px-3 py-1">
                {finish}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Ports item={item} />
      <Paths item={item} />
      <Routing item={item} />
      <Source item={item} />
    </article>
  );
}

function StatusNote({ item }: { item: GearItemPage }) {
  if (item.status === "pending") {
    return (
      <p role="status" className="bg-muted rounded-lg px-4 py-3 text-sm">
        Waiting for review. Only you and the site&apos;s admins can see this
        page until it&apos;s approved.
      </p>
    );
  }
  if (item.status === "rejected") {
    return (
      <p role="status" className="bg-muted rounded-lg px-4 py-3 text-sm">
        This submission wasn&apos;t added to the catalog
        {item.reviewNote ? `: ${item.reviewNote}` : "."}
      </p>
    );
  }
  return null;
}

function Ports({ item }: { item: GearItemPage }) {
  const labels = new Map(item.ports.map((p) => [p.key, p.label]));
  const groups = SIGNAL_TYPE_ORDER.map((type) => ({
    type,
    ports: item.ports.filter((p) => p.signalTypes.includes(type)),
  })).filter((group) => group.ports.length > 0);
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="ports" className="flex flex-col gap-4">
      <h2 id="ports" className="text-lg font-semibold">
        Jacks
      </h2>
      {groups.map(({ type, ports }) => (
        <div key={type} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-sm font-medium">
            {SIGNAL_TYPE_NAMES[type]}
          </h3>
          <ul className="divide-y rounded-lg border text-sm">
            {ports.map((port) => {
              const detail = describePortSpec(port.spec, type);
              const sharedWith = item.ports
                .filter(
                  (other) =>
                    other.key !== port.key &&
                    port.jackGroup &&
                    other.jackGroup === port.jackGroup,
                )
                .map((other) => labels.get(other.key));
              return (
                <li
                  key={port.key}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2"
                >
                  <span>
                    <span className="font-medium">{port.label}</span>{" "}
                    <span className="text-muted-foreground">
                      {port.direction === "in" ? "in" : "out"}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {[
                      detail,
                      port.signalTypes.length > 1 &&
                        `also ${port.signalTypes
                          .filter((t) => t !== type)
                          .map((t) => SIGNAL_TYPE_NAMES[t].toLowerCase())
                          .join(", ")}`,
                      sharedWith.length > 0 &&
                        `same jack as ${sharedWith.join(", ")}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Paths({ item }: { item: GearItemPage }) {
  if (item.paths.length === 0) return null;
  const label = (key: string) =>
    item.ports.find((p) => p.key === key)?.label ?? key;
  return (
    <section aria-labelledby="paths" className="flex flex-col gap-3">
      <h2 id="paths" className="text-lg font-semibold">
        Signal paths
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {item.paths.map((p) => (
          <li key={p.id}>
            {label(p.fromPortKey)} → {label(p.toPortKey)}
            {p.activeWhenUnplugged && (
              <span className="text-muted-foreground">
                {" "}
                (while {label(p.activeWhenUnplugged)} is empty)
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Routing({ item }: { item: GearItemPage }) {
  const spec = item.routingSpec as Record<string, unknown>;
  const label = (key: string) =>
    item.ports.find((p) => p.key === key)?.label ?? key;

  if (item.routingModel === "programmable") {
    return (
      <p className="text-sm">
        Routing is programmable: each preset sets how its inputs, outputs, sends
        and returns connect.
      </p>
    );
  }
  if (item.routingModel === "loop_switcher") {
    const loops = spec.loops as {
      key: string;
      label: string;
      send: string;
      return: string;
    }[];
    return (
      <section aria-labelledby="loops" className="flex flex-col gap-3">
        <h2 id="loops" className="text-lg font-semibold">
          Loops
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {loops.map((loop) => (
            <li key={loop.key}>
              {loop.label}: {label(loop.send)} → {label(loop.return)}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">
          {spec.reorderable ? "Loop order can be changed" : "Fixed loop order"}
          {spec.parallel ? "; loops can run in parallel." : "."}
        </p>
      </section>
    );
  }
  if (item.routingModel === "channels") {
    const channels = spec.channels as { key: string; label: string }[];
    return (
      <p className="text-sm">
        Channels: {channels.map((c) => c.label).join(", ")}
      </p>
    );
  }
  if (item.routingModel === "switch") {
    const positions = spec.positions as {
      key: string;
      label: string;
      paths: { from: string; to: string }[];
    }[];
    return (
      <section aria-labelledby="positions" className="flex flex-col gap-3">
        <h2 id="positions" className="text-lg font-semibold">
          Switch positions
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {positions.map((position) => (
            <li key={position.key}>
              {position.label}:{" "}
              {position.paths
                .map((p) => `${label(p.from)} → ${label(p.to)}`)
                .join(", ")}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return null;
}

function Source({ item }: { item: GearItemPage }) {
  const unconfirmed = item.specs.unconfirmed ?? [];
  return (
    <section
      aria-labelledby="source"
      className="text-muted-foreground flex flex-col gap-2 border-t pt-4 text-sm"
    >
      <h2 id="source" className="sr-only">
        Where this comes from
      </h2>
      {item.sourceUrl ? (
        <p>
          Checked against{" "}
          <a
            href={item.sourceUrl}
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-4"
          >
            the maker&apos;s published specs
          </a>
          .
        </p>
      ) : item.createdBy ? (
        <p>Submitted by a member.</p>
      ) : (
        <p>Not yet checked against the maker&apos;s own specs.</p>
      )}
      {unconfirmed.length > 0 && (
        <p>Not yet confirmed with the maker: {unconfirmed.join(", ")}.</p>
      )}
    </section>
  );
}
