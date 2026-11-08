import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="text-muted-foreground border-t px-4 py-4 text-center text-sm">
      <Link
        href="/privacy"
        className="hover:text-foreground underline-offset-4 hover:underline"
      >
        Privacy
      </Link>
    </footer>
  );
}
