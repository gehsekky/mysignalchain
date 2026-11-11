import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms · mysignalchain" };

// Short draft for the beta, published before photo uploads open. A lawyer
// reviews the final version in M7 (see docs/PLAN.md).
const LAST_UPDATED = "November 10, 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 text-sm leading-6 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-2xl font-semibold tracking-tight">Terms</h1>
      <p className="text-muted-foreground mt-1">
        Draft for the beta. Last updated {LAST_UPDATED}.
      </p>

      <p className="mt-6">
        mysignalchain is a hobby site run by one person. By using it you agree
        to these terms. The <Link href="/privacy">privacy policy</Link> explains
        what data the site keeps.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 13 or older.</li>
        <li>You&apos;re responsible for what you post from your account.</li>
      </ul>

      <h2>What you post</h2>
      <ul>
        <li>
          You keep ownership of the photos and text you post. Only post photos
          you took yourself or have the right to share.
        </li>
        <li>
          You give mysignalchain a non-exclusive, worldwide, royalty-free
          license to store, copy, resize and display what you post, on this
          site, so the site can work: for example, showing your photos on your
          profile, or on a gear page you offered one for. The license ends when
          you delete the content or your account, apart from copies in backups,
          which are deleted within 30 days.
        </li>
        <li>
          Brand and product names identify gear; they don&apos;t mean the maker
          endorses the site.
        </li>
      </ul>

      <h2>Not allowed</h2>
      <ul>
        <li>
          Photos or text you don&apos;t have the rights to, including product
          photos copied from makers or shops.
        </li>
        <li>
          Anything illegal, hateful, harassing, sexually explicit or violent.
        </li>
        <li>
          Personal details of other people, or photos of them without consent.
        </li>
        <li>Spam, ads, and attempts to break or overload the site.</li>
      </ul>
      <p className="mt-2">
        Admins may remove content or close accounts that break these rules.
      </p>

      <h2>Copyright complaints</h2>
      <p>
        If something here infringes your copyright, see{" "}
        <Link href="/dmca">how to report it</Link>. Accounts that repeatedly
        post infringing content are closed.
      </p>

      <h2>Beta</h2>
      <p>
        The site is provided as is, without warranties. While it&apos;s in beta,
        data may be wiped without notice. Gear data may contain mistakes; check
        the maker&apos;s specs before you plug anything in.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change; the date above shows the latest version.
        Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>
  );
}
