"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { completeOnboarding } from "@/lib/onboarding/complete";

export type OnboardingFormState = {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
};

export async function submitOnboarding(
  _previous: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");

  const input = {
    handle: String(formData.get("handle") ?? ""),
    birthMonth: String(formData.get("birthMonth") ?? ""),
    birthYear: String(formData.get("birthYear") ?? ""),
  };

  const result = await completeOnboarding(getDb(), viewer.id, input);

  switch (result.status) {
    case "complete":
      redirect("/");
    case "too-young":
      // The session is already gone with the account; this clears the cookie.
      await getAuth()
        .api.signOut({ headers: await headers() })
        .catch(() => undefined);
      redirect("/onboarding/not-eligible");
    case "handle-taken":
      return { fieldErrors: { handle: ["That handle is already taken."] } };
    case "invalid":
      return { fieldErrors: result.fieldErrors };
  }
}
