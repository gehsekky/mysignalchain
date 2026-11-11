"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { resolveMergeTarget, getGearItem } from "@/lib/catalog/queries";
import {
  addOwnedGear,
  updateOwnedGear,
  type OwnedGearInput,
} from "@/lib/collection";
import { getDb } from "@/lib/db/client";
import {
  deleteOwnPhoto,
  removeOwnedGear,
  setOffered,
  syncOwnedGearPhotos,
} from "@/lib/images";
import { canEditOwnProfile, canViewGearItem } from "@/lib/policy";

export type UnitFormState = {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
};

async function requireMember() {
  const viewer = await getViewer();
  if (!canEditOwnProfile(viewer)) redirect(viewer ? "/onboarding" : "/sign-in");
  return viewer!;
}

function readUnitForm(formData: FormData): OwnedGearInput {
  const value = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : undefined;
  };
  return {
    status: value("status") as OwnedGearInput["status"],
    finish: value("finish"),
    customFinish: value("customFinish"),
    nickname: value("nickname"),
    mods: value("mods"),
    notes: value("notes"),
    visibility: formData.get("public") === "on" ? "public" : "private",
  };
}

function toState(
  result: Awaited<ReturnType<typeof addOwnedGear>>,
): UnitFormState {
  if (result.status === "invalid") {
    return {
      fieldErrors: result.fieldErrors,
      formError: "Check the highlighted fields.",
    };
  }
  if (result.status === "limit") return { formError: result.message };
  return { formError: "That item wasn't found." };
}

export async function addUnitAction(
  _previous: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const viewer = await requireMember();
  const db = getDb();
  const item = await getGearItem(
    db,
    String(formData.get("brand") ?? ""),
    String(formData.get("model") ?? ""),
  );
  if (!item || !canViewGearItem(viewer, item) || item.status === "rejected") {
    return { formError: "That item wasn't found." };
  }
  let gearItemId = item.id;
  if (item.status === "merged" && item.mergedIntoId) {
    const target = await resolveMergeTarget(db, item.mergedIntoId);
    if (!target) return { formError: "That item wasn't found." };
    gearItemId = target.id;
  }
  const result = await addOwnedGear(
    db,
    viewer.id,
    gearItemId,
    readUnitForm(formData),
  );
  if (result.status !== "saved") return toState(result);
  redirect(`/collection/${result.id}/edit?added=1`);
}

export async function updateUnitAction(
  _previous: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const viewer = await requireMember();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { formError: "That item wasn't found." };
  const db = getDb();
  const result = await updateOwnedGear(
    db,
    viewer.id,
    id.data,
    readUnitForm(formData),
  );
  if (result.status !== "saved") return toState(result);
  await syncOwnedGearPhotos(db, id.data);
  redirect(`/u/${viewer.handle}/gear/${id.data}`);
}

export async function removeUnitAction(formData: FormData) {
  const viewer = await requireMember();
  const removed = await removeOwnedGear(
    getDb(),
    viewer.id,
    String(formData.get("id") ?? ""),
  );
  if (!removed) notFound();
  redirect(`/u/${viewer.handle}`);
}

export async function deletePhotoAction(formData: FormData) {
  const viewer = await requireMember();
  const unitId = z.uuid().parse(formData.get("unitId"));
  await deleteOwnPhoto(
    getDb(),
    viewer.id,
    String(formData.get("imageId") ?? ""),
  );
  redirect(`/collection/${unitId}/edit`);
}

export async function setOfferedAction(formData: FormData) {
  const viewer = await requireMember();
  const unitId = z.uuid().parse(formData.get("unitId"));
  await setOffered(
    getDb(),
    viewer.id,
    String(formData.get("imageId") ?? ""),
    formData.get("offered") === "true",
  );
  redirect(`/collection/${unitId}/edit`);
}
