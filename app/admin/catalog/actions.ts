"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { approveItem, mergeItem, rejectItem } from "@/lib/catalog/moderate";
import { getGearItem } from "@/lib/catalog/queries";
import { parseGearReference } from "@/lib/catalog/text";
import { getDb } from "@/lib/db/client";
import { canModerateCatalog } from "@/lib/policy";

const itemId = z.uuid();

async function requireAdmin() {
  const viewer = await getViewer();
  if (!canModerateCatalog(viewer)) notFound();
  return viewer!;
}

function done(message: string): never {
  redirect(`/admin/catalog?message=${encodeURIComponent(message)}`);
}

export async function approveAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = itemId.safeParse(formData.get("itemId"));
  if (!id.success) done("That item wasn't found.");
  const result = await approveItem(getDb(), admin.id, id.data);
  done(result.status === "done" ? "Approved." : resultMessage(result));
}

export async function rejectAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = itemId.safeParse(formData.get("itemId"));
  if (!id.success) done("That item wasn't found.");
  const note = z
    .string()
    .max(500)
    .catch("")
    .parse(formData.get("note") ?? "");
  const result = await rejectItem(getDb(), admin.id, id.data, note);
  done(result.status === "done" ? "Rejected." : resultMessage(result));
}

export async function mergeAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = itemId.safeParse(formData.get("itemId"));
  if (!id.success) done("That item wasn't found.");
  const reference = parseGearReference(String(formData.get("target") ?? ""));
  if (!reference) done("Enter the item to merge into, like boss/sd-1.");
  const db = getDb();
  const target = await getGearItem(db, reference.brand, reference.model);
  if (!target) done(`No item at ${reference.brand}/${reference.model}.`);
  const result = await mergeItem(db, admin.id, id.data, target.id);
  done(
    result.status === "done"
      ? `Merged into ${target.brand.name} ${target.modelName}.`
      : resultMessage(result),
  );
}

function resultMessage(
  result: { status: "not-found" } | { status: "invalid"; message: string },
) {
  return result.status === "invalid"
    ? result.message
    : "That item wasn't found.";
}
