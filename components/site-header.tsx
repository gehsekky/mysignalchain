import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-3xl items-center gap-6 px-4 py-3 text-sm"
      >
        <Link href="/" className="font-semibold tracking-tight">
          mysignalchain
        </Link>
        <Link
          href="/gear"
          className="text-muted-foreground hover:text-foreground"
        >
          Gear
        </Link>
      </nav>
    </header>
  );
}
