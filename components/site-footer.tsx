import Link from "next/link";

const linkClass = "hover:text-foreground underline-offset-4 hover:underline";

export function SiteFooter() {
  return (
    <footer className="text-muted-foreground flex justify-center gap-6 border-t px-4 py-4 text-sm">
      <Link href="/privacy" className={linkClass}>
        Privacy
      </Link>
      <Link href="/terms" className={linkClass}>
        Terms
      </Link>
      <Link href="/dmca" className={linkClass}>
        Copyright
      </Link>
    </footer>
  );
}
