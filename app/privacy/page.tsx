import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy · mysignalchain" };

// Draft for the beta. Keep it in step with what the code actually does; the
// final version comes in M7 (see docs/PLAN.md).
const LAST_UPDATED = "November 10, 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 text-sm leading-6 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-muted-foreground mt-1">
        Draft for the beta. Last updated {LAST_UPDATED}.
      </p>

      <p className="mt-6">
        mysignalchain is a hobby site run by one person. It collects only what
        it needs to let you sign in and keep your signal chains, and it
        doesn&apos;t sell or share your data.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          From Google, when you sign in: your name, email address and profile
          picture.
        </li>
        <li>
          The handle you choose, and the display name and short bio you can set
          on your profile. These are public on your profile page.
        </li>
        <li>
          The gear you add to your collection, with its finish, nickname, mods
          and notes. Each item is private unless you choose to show it on your
          profile.
        </li>
        <li>Photos you upload (see below).</li>
        <li>
          That you passed the 13-or-older check. Your birth month and year are
          used for the check and not stored.
        </li>
        <li>
          For each signed-in session: a session cookie, plus the IP address and
          browser it was started from. These are deleted when the session
          expires or you sign out.
        </li>
        <li>
          IP addresses of requests, held briefly in memory to limit repeated
          sign-in attempts.
        </li>
      </ul>

      <h2>Photos</h2>
      <ul>
        <li>
          Before a photo is stored, its metadata is removed, including any GPS
          location, camera details and date. The original file is deleted right
          after; only resized copies are kept.
        </li>
        <li>
          New photos are checked by an admin. Until then only you and the
          site&apos;s admins can see them.
        </li>
        <li>
          Once approved, a photo is visible to anyone who can see the item
          it&apos;s on. If you offer a photo for a gear page and an admin uses
          it there, anyone can see it on that page, credited to your handle.
        </li>
        <li>Deleting a photo, or the item it&apos;s on, deletes its files.</li>
      </ul>

      <h2>Google sign-in</h2>
      <p>
        The site asks Google only for your basic profile and email address. It
        never reads anything else from your Google account. The access token
        Google returns is stored encrypted, and the ID token isn&apos;t stored.
      </p>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>No ads.</li>
        <li>No analytics or tracking scripts.</li>
        <li>No selling or sharing of your data.</li>
      </ul>

      <h2>Where it&apos;s kept</h2>
      <p>
        On Amazon Web Services servers in the United States. Photos are served
        through Amazon CloudFront. Database backups are kept for 30 days.
      </p>

      <h2>Beta</h2>
      <p>While the site is in beta, data may be wiped without notice.</p>

      <h2>Deleting your account</h2>
      <p>
        Self-service account deletion and data export are on the way. Until
        then, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from
        the address you sign in with, and your account will be removed along
        with everything you created.
      </p>

      <h2>Children</h2>
      <p>The site isn&apos;t for anyone under 13.</p>

      <h2>Contact</h2>
      <p>
        For privacy questions or requests, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>
  );
}
