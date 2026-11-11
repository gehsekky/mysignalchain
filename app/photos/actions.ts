"use server";

import { getViewer } from "@/lib/auth/viewer";
import { getGearItem } from "@/lib/catalog/queries";
import { parseGearReference } from "@/lib/catalog/text";
import { getDb } from "@/lib/db/client";
import {
  finishUpload,
  startUpload,
  type UploadTarget,
  type UploadTicket,
  uploadsMode,
} from "@/lib/images";
import { canModerateImages, canUploadImages } from "@/lib/policy";

/** What the browser asks to upload to. Gear pages are named like boss/sd-1. */
export type UploadRequest =
  { kind: "owned"; ownedGearId: string } | { kind: "gear"; reference: string };

export type StartResult =
  | { ok: true; ticket: UploadTicket; target: UploadTarget }
  | { ok: false; message: string };

async function allowed(request: UploadRequest) {
  const viewer = await getViewer();
  if (!canUploadImages(viewer, uploadsMode())) return null;
  if (request.kind === "gear" && !canModerateImages(viewer)) return null;
  return viewer!;
}

async function resolveTarget(
  request: UploadRequest,
): Promise<UploadTarget | null> {
  if (request.kind === "owned") {
    return { kind: "owned", ownedGearId: String(request.ownedGearId) };
  }
  const reference = parseGearReference(String(request.reference));
  if (!reference) return null;
  const item = await getGearItem(getDb(), reference.brand, reference.model);
  return item?.status === "approved"
    ? { kind: "gear", gearItemId: item.id }
    : null;
}

export async function startUploadAction(
  request: UploadRequest,
): Promise<StartResult> {
  const viewer = await allowed(request);
  if (!viewer) return { ok: false, message: "Photo uploads aren't open yet." };
  const target = await resolveTarget(request);
  if (!target) {
    return {
      ok: false,
      message:
        "No approved item there. Use the form brand/model, like boss/sd-1.",
    };
  }
  const result = await startUpload(getDb(), viewer.id, target);
  return result.status === "ok"
    ? { ok: true, ticket: result.ticket, target }
    : { ok: false, message: result.message };
}

export async function finishUploadAction(input: {
  ticket: { key: string; expires: string; token: string };
  target: UploadTarget;
  offered?: boolean;
  cc?: { attribution: string; license: string; sourceUrl: string };
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const viewer = await allowed(
    input.target?.kind === "gear"
      ? { kind: "gear", reference: "" }
      : { kind: "owned", ownedGearId: "" },
  );
  if (!viewer) return { ok: false, message: "Photo uploads aren't open yet." };
  const result = await finishUpload(getDb(), viewer.id, {
    ticket: input.ticket,
    target: input.target,
    offered: input.offered === true,
    cc: input.cc,
  });
  return result.status === "ok"
    ? { ok: true }
    : { ok: false, message: result.message };
}
