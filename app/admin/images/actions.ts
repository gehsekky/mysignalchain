"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { approveImage, rejectImage, removeFromGearPage } from "@/lib/images";
import { canModerateImages } from "@/lib/policy";

const imageId = z.uuid();

async function requireAdmin() {
  const viewer = await getViewer();
  if (!canModerateImages(viewer)) notFound();
  return viewer!;
}

function done(message: string, back = "/admin/images"): never {
  redirect(`${back}?message=${encodeURIComponent(message)}`);
}

function describe(
  result: Awaited<ReturnType<typeof approveImage>>,
  ok: string,
) {
  if (result.status === "done") return ok;
  return result.status === "invalid"
    ? result.message
    : "That photo wasn't found.";
}

export async function approveImageAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = imageId.safeParse(formData.get("imageId"));
  if (!id.success) done("That photo wasn't found.");
  const useOnGearPage = formData.get("gearPage") === "true";
  const result = await approveImage(getDb(), admin.id, id.data, {
    useOnGearPage,
  });
  done(
    describe(
      result,
      useOnGearPage ? "Approved and added to the gear page." : "Approved.",
    ),
  );
}

export async function rejectImageAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = imageId.safeParse(formData.get("imageId"));
  if (!id.success) done("That photo wasn't found.");
  const note = z
    .string()
    .max(500)
    .catch("")
    .parse(formData.get("note") ?? "");
  done(
    describe(await rejectImage(getDb(), admin.id, id.data, note), "Rejected."),
  );
}

export async function removeFromGearPageAction(formData: FormData) {
  await requireAdmin();
  const id = imageId.safeParse(formData.get("imageId"));
  const back = String(formData.get("back") ?? "");
  if (!id.success) done("That photo wasn't found.");
  await removeFromGearPage(getDb(), id.data);
  redirect(
    /^\/gear\/[a-z0-9-]+\/[a-z0-9-]+$/.test(back) ? back : "/admin/images",
  );
}
