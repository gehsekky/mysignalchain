import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/viewer";
import { canUseAccountFeatures } from "@/lib/policy";
import { SignOutButton } from "./sign-out-button";

async function AccountPanel() {
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <Link
        href="/sign-in"
        className={buttonVariants({ className: "self-start" })}
      >
        Sign in
      </Link>
    );
  }
  if (!canUseAccountFeatures(viewer)) redirect("/onboarding");

  return (
    <div className="flex items-center gap-4">
      <p>
        Signed in as <strong>@{viewer.handle}</strong>
      </p>
      <SignOutButton />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">mysignalchain</h1>
      <p className="text-muted-foreground text-lg">
        Build, version and share your guitar signal chain.
      </p>
      <Suspense>
        <AccountPanel />
      </Suspense>
    </div>
  );
}
