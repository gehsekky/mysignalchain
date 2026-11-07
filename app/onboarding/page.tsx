import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { hasFinishedOnboarding } from "@/lib/policy";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Finish signing up · mysignalchain" };

async function Onboarding() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (hasFinishedOnboarding(viewer)) redirect("/");
  return <OnboardingForm />;
}

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Finish signing up
      </h1>
      <Suspense>
        <Onboarding />
      </Suspense>
    </div>
  );
}
