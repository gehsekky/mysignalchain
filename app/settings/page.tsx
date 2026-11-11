import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { nextHandleChangeAt } from "@/lib/handles/change";
import { canEditOwnProfile } from "@/lib/policy";
import { getProfile } from "@/lib/profile";
import { HandleForm, ProfileForm } from "./forms";

export const metadata = { title: "Settings · mysignalchain" };

async function Settings() {
  const viewer = await getViewer();
  if (!canEditOwnProfile(viewer)) redirect(viewer ? "/onboarding" : "/sign-in");
  const db = getDb();
  const [profile, next] = await Promise.all([
    getProfile(db, viewer!.handle!),
    nextHandleChangeAt(db, viewer!.id),
  ]);
  if (!profile) redirect("/");
  return (
    <>
      <section aria-labelledby="profile" className="flex flex-col gap-4">
        <h2 id="profile" className="text-lg font-semibold">
          Profile
        </h2>
        <ProfileForm
          displayName={profile.displayName}
          bio={profile.bio ?? ""}
        />
      </section>
      <section
        aria-labelledby="handle-heading"
        className="flex flex-col gap-4 border-t pt-6"
      >
        <h2 id="handle-heading" className="text-lg font-semibold">
          Handle
        </h2>
        <HandleForm
          handle={profile.handle}
          nextChange={
            next
              ? next.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })
              : null
          }
        />
      </section>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <Suspense>
        <Settings />
      </Suspense>
    </div>
  );
}
