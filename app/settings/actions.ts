"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { changeHandle } from "@/lib/handles/change";
import { canEditOwnProfile } from "@/lib/policy";
import { updateProfile } from "@/lib/profile";

export type SettingsState = {
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  error?: string;
};

async function requireMember() {
  const viewer = await getViewer();
  if (!canEditOwnProfile(viewer)) redirect(viewer ? "/onboarding" : "/sign-in");
  return viewer!;
}

export async function profileAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const viewer = await requireMember();
  const result = await updateProfile(getDb(), viewer.id, {
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
  });
  return result.status === "saved"
    ? { message: "Saved." }
    : {
        fieldErrors: result.fieldErrors,
        error: "Check the highlighted fields.",
      };
}

export async function handleAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const viewer = await requireMember();
  const result = await changeHandle(
    getDb(),
    viewer.id,
    String(formData.get("handle") ?? ""),
  );
  switch (result.status) {
    case "changed":
      redirect(`/u/${result.handle}`);
    case "unchanged":
      return { message: "That's already your handle." };
    case "taken":
      return { error: "That handle is taken." };
    case "invalid":
      return { error: result.message };
    case "too-soon":
      return {
        error: `You can change your handle again on ${formatDate(result.nextChangeAt)}.`,
      };
  }
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
