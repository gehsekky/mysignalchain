"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { submitGear, type SubmissionInput } from "@/lib/catalog/submit";
import { getDb } from "@/lib/db/client";
import { canSubmitGear } from "@/lib/policy";

export type SubmitFormState = {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
  existing?: { href: string };
};

const FIELDS = [
  "brandName",
  "modelName",
  "categorySlug",
  "years",
  "template",
  "volts",
  "ma",
  "polarity",
  "expression",
  "tap",
  "midiIn",
  "midiOut",
  "aliases",
  "finishes",
  "sourceUrl",
] as const;

export async function submitGearAction(
  _previous: SubmitFormState,
  formData: FormData,
): Promise<SubmitFormState> {
  const viewer = await getViewer();
  if (!canSubmitGear(viewer)) redirect(viewer ? "/onboarding" : "/sign-in");

  // Raw form values; submitGear validates them with its Zod schema.
  const input = Object.fromEntries(
    FIELDS.map((field) => [field, formData.get(field) ?? undefined]),
  ) as SubmissionInput;
  const result = await submitGear(getDb(), viewer!.id, input);

  switch (result.status) {
    case "submitted":
      redirect(`/gear/${result.brandSlug}/${result.slug}`);
    case "exists":
      return { existing: { href: `/gear/${result.brandSlug}/${result.slug}` } };
    case "limit":
      return { formError: result.message };
    case "invalid":
      return {
        fieldErrors: result.fieldErrors,
        formError:
          result.fieldErrors.form?.[0] ?? "Check the highlighted fields.",
      };
  }
}
