import Link from "next/link";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { canModerateCatalog, canUseAccountFeatures } from "@/lib/policy";

const linkClass = "text-muted-foreground hover:text-foreground";

async function AccountLinks() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href="/sign-in" className={linkClass}>
        Sign in
      </Link>
    );
  }
  if (!canUseAccountFeatures(viewer)) {
    return (
      <Link href="/onboarding" className={linkClass}>
        Finish signing up
      </Link>
    );
  }
  return (
    <>
      <Link href={`/u/${viewer.handle}`} className={linkClass}>
        My gear
      </Link>
      <Link href="/settings" className={linkClass}>
        Settings
      </Link>
      {canModerateCatalog(viewer) && (
        <Link href="/admin/catalog" className={linkClass}>
          Admin
        </Link>
      )}
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm"
      >
        <Link href="/" className="font-semibold tracking-tight">
          mysignalchain
        </Link>
        <Link href="/gear" className={linkClass}>
          Gear
        </Link>
        <span className="ml-auto flex gap-6">
          <Suspense>
            <AccountLinks />
          </Suspense>
        </span>
      </nav>
    </header>
  );
}
