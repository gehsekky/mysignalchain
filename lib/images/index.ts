/**
 * Photos: upload, moderation, publication and deletion.
 *
 * Every version is stored under private/. A photo is published (copied to
 * public/ for CloudFront) once it's approved and attached to something
 * anyone can see: a gear page, or a public unit of a public catalog item.
 * Anything not published is served by the app after canViewImage, so
 * publication only affects speed. Unpublishing is immediate: when a photo is
 * rejected or deleted, or its unit goes private, the public copies are
 * deleted and the CDN cache invalidated.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, count, eq, gte, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/client";
import {
  brands,
  gearItemImages,
  gearItems,
  images,
  ownedGear,
  ownedGearImages,
  users,
} from "@/lib/db/schema";
import { getAuthEnv, getImagesEnv } from "@/lib/env";
import { DMCA_AGENT } from "@/lib/legal";
import {
  canViewGearItem,
  canViewImage,
  canViewOwnedGear,
  type UploadsMode,
  type Viewer,
} from "@/lib/policy";
import { ImageRejected, processImage } from "./process";
import { getImageStorage, type PresignedUpload } from "./storage";

export const UPLOADS_PER_DAY = 30;
export const MAX_PENDING_IMAGES = 50;
export const MAX_PHOTOS_PER_UNIT = 8;
/** What member photos are licensed under; see /terms. */
export const MEMBER_LICENSE = "mysignalchain-terms";

const privateKey = (id: string, width: number) => `private/${id}/${width}.webp`;
const publicKey = (id: string, width: number) => `public/${id}/${width}.webp`;

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/** What an upload will be attached to. */
export type UploadTarget =
  { kind: "owned"; ownedGearId: string } | { kind: "gear"; gearItemId: string };

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("owned"), ownedGearId: z.uuid() }),
  z.object({ kind: z.literal("gear"), gearItemId: z.uuid() }),
]);

export type UploadTicket = {
  upload: PresignedUpload;
  key: string;
  expires: string;
  token: string;
};

function ticketMac(
  userId: string,
  key: string,
  expires: string,
  target: UploadTarget,
) {
  const targetId =
    target.kind === "owned" ? target.ownedGearId : target.gearItemId;
  return createHmac(
    "sha256",
    `upload-ticket:${getAuthEnv().BETTER_AUTH_SECRET}`,
  )
    .update([userId, key, expires, target.kind, targetId].join("\n"))
    .digest("base64url");
}

function ticketValid(
  userId: string,
  ticket: { key: string; expires: string; token: string },
  target: UploadTarget,
) {
  if (!/^incoming\/[0-9a-f-]{36}$/.test(ticket.key)) return false;
  if (!(Number(ticket.expires) > Date.now())) return false;
  const expected = Buffer.from(
    ticketMac(userId, ticket.key, ticket.expires, target),
  );
  const given = Buffer.from(ticket.token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type UploadResult =
  { status: "ok"; imageId: string } | { status: "rejected"; message: string };

const rejected = (message: string) =>
  ({ status: "rejected", message }) as const;

/** Checks the limits and that the target is the user's to add photos to. */
async function checkUpload(
  db: Database,
  userId: string,
  target: UploadTarget,
  now: Date,
): Promise<string | null> {
  if (target.kind === "owned") {
    const [unit] = await db
      .select({ userId: ownedGear.userId })
      .from(ownedGear)
      .where(eq(ownedGear.id, target.ownedGearId));
    if (!unit || unit.userId !== userId) return "That item wasn't found.";
    const [{ photos }] = await db
      .select({ photos: count() })
      .from(ownedGearImages)
      .where(eq(ownedGearImages.ownedGearId, target.ownedGearId));
    if (photos >= MAX_PHOTOS_PER_UNIT) {
      return `Each item can have up to ${MAX_PHOTOS_PER_UNIT} photos.`;
    }
  } else {
    const [item] = await db
      .select({ status: gearItems.status })
      .from(gearItems)
      .where(eq(gearItems.id, target.gearItemId));
    if (item?.status !== "approved") return "That item wasn't found.";
  }
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [{ today }] = await db
    .select({ today: count() })
    .from(images)
    .where(and(eq(images.uploaderId, userId), gte(images.createdAt, since)));
  if (today >= UPLOADS_PER_DAY) {
    return `You can upload up to ${UPLOADS_PER_DAY} photos a day. Try again tomorrow.`;
  }
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(images)
    .where(and(eq(images.uploaderId, userId), eq(images.status, "pending")));
  if (pending >= MAX_PENDING_IMAGES) {
    return `You have ${MAX_PENDING_IMAGES} photos waiting for review. Upload more once some are reviewed.`;
  }
  return null;
}

/**
 * Step 1: a one-off form the browser posts the file to. Callers check
 * canUploadImages first; gear page uploads also need canModerateImages.
 */
export async function startUpload(
  db: Database,
  userId: string,
  rawTarget: UploadTarget,
  now = new Date(),
): Promise<
  | { status: "ok"; ticket: UploadTicket }
  | { status: "rejected"; message: string }
> {
  const target = targetSchema.safeParse(rawTarget);
  if (!target.success) return rejected("That item wasn't found.");
  const problem = await checkUpload(db, userId, target.data, now);
  if (problem) return rejected(problem);
  const key = `incoming/${randomUUID()}`;
  const expires = String(now.getTime() + 10 * 60 * 1000);
  const upload = await getImageStorage().presignUpload(key);
  return {
    status: "ok",
    ticket: {
      upload,
      key,
      expires,
      token: ticketMac(userId, key, expires, target.data),
    },
  };
}

export const ccDetailsSchema = z.object({
  attribution: z.string().trim().min(1, "Enter the author.").max(200),
  license: z
    .string()
    .trim()
    .min(1, "Enter the license, like CC BY-SA 4.0.")
    .max(100),
  sourceUrl: z
    .url({
      protocol: /^https$/,
      error: "Enter the https link to the original.",
    })
    .max(500),
});

export type FinishUploadInput = {
  ticket: { key: string; expires: string; token: string };
  target: UploadTarget;
  /** Member photos: offer this one for the gear page. */
  offered?: boolean;
  /** Admin gear page photos: Creative Commons details. */
  cc?: z.input<typeof ccDetailsSchema>;
};

/**
 * Step 2, after the browser has posted the file: process it, store the
 * versions and record the photo. The upload itself is always deleted.
 */
export async function finishUpload(
  db: Database,
  userId: string,
  input: FinishUploadInput,
  now = new Date(),
): Promise<UploadResult> {
  const target = targetSchema.safeParse(input.target);
  if (!target.success || !ticketValid(userId, input.ticket, target.data)) {
    return rejected("That upload expired. Try again.");
  }
  const cc =
    target.data.kind === "gear"
      ? ccDetailsSchema.safeParse(input.cc ?? {})
      : null;
  if (cc && !cc.success) {
    return rejected(cc.error.issues[0]?.message ?? "Check the photo details.");
  }

  const storage = getImageStorage();
  const original = await storage.get(input.ticket.key);
  await storage.delete([input.ticket.key]);
  if (!original) return rejected("The upload didn't arrive. Try again.");

  const problem = await checkUpload(db, userId, target.data, now);
  if (problem) return rejected(problem);

  let processed;
  try {
    processed = await processImage(original);
  } catch (error) {
    if (error instanceof ImageRejected) return rejected(error.message);
    throw error;
  }

  const id = randomUUID();
  const keys = processed.versions.map((v) => privateKey(id, v.width));
  for (const version of processed.versions) {
    await storage.put(
      privateKey(id, version.width),
      version.data,
      "image/webp",
    );
  }

  try {
    await db.transaction(async (tx) => {
      const base = {
        id,
        uploaderId: userId,
        widths: processed.versions.map((v) => v.width),
        width: processed.width,
        height: processed.height,
        createdAt: now,
        updatedAt: now,
      };
      if (target.data.kind === "owned") {
        const ownedGearId = target.data.ownedGearId;
        await tx.insert(images).values({
          ...base,
          source: "user_upload",
          license: MEMBER_LICENSE,
          status: "pending",
        });
        const [{ last }] = await tx
          .select({ last: max(ownedGearImages.sort) })
          .from(ownedGearImages)
          .where(eq(ownedGearImages.ownedGearId, ownedGearId));
        await tx.insert(ownedGearImages).values({
          imageId: id,
          ownedGearId,
          offeredForGearPage: input.offered ?? false,
          sort: (last ?? -1) + 1,
        });
      } else {
        // Added by an admin, with the license details: approved as is.
        const gearItemId = target.data.gearItemId;
        const details = cc!.data!;
        await tx.insert(images).values({
          ...base,
          source: "cc",
          license: details.license,
          attribution: details.attribution,
          sourceUrl: details.sourceUrl,
          status: "approved",
          reviewedBy: userId,
          reviewedAt: now,
        });
        const [{ last }] = await tx
          .select({ last: max(gearItemImages.sort) })
          .from(gearItemImages)
          .where(eq(gearItemImages.gearItemId, gearItemId));
        await tx
          .insert(gearItemImages)
          .values({ imageId: id, gearItemId, sort: (last ?? -1) + 1 });
      }
    });
  } catch (error) {
    await storage.delete(keys);
    throw error;
  }

  await syncPublication(db, [id]);
  return { status: "ok", imageId: id };
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

/** Approved photos attached to something anyone can see. */
async function shouldPublish(db: Database, imageIds: string[]) {
  if (imageIds.length === 0) return new Set<string>();
  const rows = await db.execute<{ id: string }>(sql`
    SELECT i.id FROM images i
    WHERE i.id IN ${sql`(${sql.join(
      imageIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`}
      AND i.status = 'approved'
      AND (
        EXISTS (
          SELECT 1 FROM gear_item_images gi
          JOIN gear_items g ON g.id = gi.gear_item_id
          WHERE gi.image_id = i.id AND g.status IN ('approved', 'merged')
        )
        OR EXISTS (
          SELECT 1 FROM owned_gear_images oi
          JOIN owned_gear o ON o.id = oi.owned_gear_id
          JOIN gear_items g ON g.id = o.gear_item_id
          WHERE oi.image_id = i.id AND o.visibility = 'public'
            AND g.status IN ('approved', 'merged')
        )
      )
  `);
  return new Set(rows.rows.map((r) => r.id));
}

/** Copies photos to public/ or removes them, to match shouldPublish. */
export async function syncPublication(db: Database, imageIds: string[]) {
  if (imageIds.length === 0) return;
  const storage = getImageStorage();
  const wanted = await shouldPublish(db, imageIds);
  const rows = await db
    .select({
      id: images.id,
      published: images.published,
      widths: images.widths,
    })
    .from(images)
    .where(inArray(images.id, imageIds));
  for (const row of rows) {
    const want = wanted.has(row.id);
    if (want === row.published) continue;
    if (want) {
      for (const w of row.widths)
        await storage.copy(privateKey(row.id, w), publicKey(row.id, w));
    } else {
      const keys = row.widths.map((w) => publicKey(row.id, w));
      await storage.delete(keys);
      await storage.invalidate(keys);
    }
    await db
      .update(images)
      .set({ published: want })
      .where(eq(images.id, row.id));
  }
}

/** After a unit's visibility changes. */
export async function syncOwnedGearPhotos(db: Database, ownedGearId: string) {
  const rows = await db
    .select({ id: ownedGearImages.imageId })
    .from(ownedGearImages)
    .where(eq(ownedGearImages.ownedGearId, ownedGearId));
  await syncPublication(
    db,
    rows.map((r) => r.id),
  );
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/** Deletes photos and every file they have. */
export async function deleteImages(db: Database, imageIds: string[]) {
  if (imageIds.length === 0) return;
  const rows = await db
    .delete(images)
    .where(inArray(images.id, imageIds))
    .returning({
      id: images.id,
      widths: images.widths,
      published: images.published,
    });
  const storage = getImageStorage();
  for (const row of rows) {
    const published = row.widths.map((w) => publicKey(row.id, w));
    await storage.delete([
      ...row.widths.map((w) => privateKey(row.id, w)),
      ...published,
    ]);
    if (row.published) await storage.invalidate(published);
  }
}

/** The owner deletes one of their photos. */
export async function deleteOwnPhoto(
  db: Database,
  userId: string,
  imageId: string,
) {
  if (!z.uuid().safeParse(imageId).success) return false;
  const [row] = await db
    .select({ id: images.id })
    .from(images)
    .innerJoin(ownedGearImages, eq(ownedGearImages.imageId, images.id))
    .innerJoin(ownedGear, eq(ownedGear.id, ownedGearImages.ownedGearId))
    .where(and(eq(images.id, imageId), eq(ownedGear.userId, userId)));
  if (!row) return false;
  await deleteImages(db, [imageId]);
  return true;
}

/** Removes a unit from a collection, with its photos. */
export async function removeOwnedGear(
  db: Database,
  userId: string,
  ownedGearId: string,
) {
  if (!z.uuid().safeParse(ownedGearId).success) return false;
  const photos = await db
    .select({ id: ownedGearImages.imageId })
    .from(ownedGearImages)
    .innerJoin(ownedGear, eq(ownedGear.id, ownedGearImages.ownedGearId))
    .where(and(eq(ownedGear.id, ownedGearId), eq(ownedGear.userId, userId)));
  const deleted = await db
    .delete(ownedGear)
    .where(and(eq(ownedGear.id, ownedGearId), eq(ownedGear.userId, userId)))
    .returning({ id: ownedGear.id });
  if (deleted.length === 0) return false;
  await deleteImages(
    db,
    photos.map((p) => p.id),
  );
  return true;
}

/** The owner offers a photo for the gear page, or withdraws the offer. */
export async function setOffered(
  db: Database,
  userId: string,
  imageId: string,
  offered: boolean,
) {
  if (!z.uuid().safeParse(imageId).success) return false;
  const [row] = await db
    .select({ imageId: ownedGearImages.imageId })
    .from(ownedGearImages)
    .innerJoin(ownedGear, eq(ownedGear.id, ownedGearImages.ownedGearId))
    .where(
      and(eq(ownedGearImages.imageId, imageId), eq(ownedGear.userId, userId)),
    );
  if (!row) return false;
  await db
    .update(ownedGearImages)
    .set({ offeredForGearPage: offered })
    .where(eq(ownedGearImages.imageId, imageId));
  if (!offered) {
    await db.delete(gearItemImages).where(eq(gearItemImages.imageId, imageId));
    await syncPublication(db, [imageId]);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Moderation (callers check canModerateImages)
// ---------------------------------------------------------------------------

export type ImageModerationResult =
  | { status: "done" }
  | { status: "not-found" }
  | { status: "invalid"; message: string };

export async function approveImage(
  db: Database,
  adminId: string,
  imageId: string,
  options: { useOnGearPage: boolean },
  now = new Date(),
): Promise<ImageModerationResult> {
  const result = await db.transaction(
    async (tx): Promise<ImageModerationResult> => {
      const [image] = await tx
        .select({
          status: images.status,
          gearItemId: ownedGear.gearItemId,
          offered: ownedGearImages.offeredForGearPage,
        })
        .from(images)
        .leftJoin(ownedGearImages, eq(ownedGearImages.imageId, images.id))
        .leftJoin(ownedGear, eq(ownedGear.id, ownedGearImages.ownedGearId))
        .where(eq(images.id, imageId))
        .for("update", { of: images });
      if (!image) return { status: "not-found" };
      if (image.status !== "pending") {
        return {
          status: "invalid",
          message: `This photo is already ${image.status}.`,
        };
      }
      if (options.useOnGearPage && !(image.offered && image.gearItemId)) {
        return {
          status: "invalid",
          message: "The owner didn't offer this photo for the gear page.",
        };
      }
      await tx
        .update(images)
        .set({
          status: "approved",
          reviewedBy: adminId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(images.id, imageId));
      if (options.useOnGearPage) {
        const gearItemId = image.gearItemId!;
        const [{ last }] = await tx
          .select({ last: max(gearItemImages.sort) })
          .from(gearItemImages)
          .where(eq(gearItemImages.gearItemId, gearItemId));
        await tx
          .insert(gearItemImages)
          .values({ imageId, gearItemId, sort: (last ?? -1) + 1 });
      }
      return { status: "done" };
    },
  );
  if (result.status === "done") await syncPublication(db, [imageId]);
  return result;
}

export async function rejectImage(
  db: Database,
  adminId: string,
  imageId: string,
  note: string,
  now = new Date(),
): Promise<ImageModerationResult> {
  const updated = await db
    .update(images)
    .set({
      status: "rejected",
      reviewedBy: adminId,
      reviewedAt: now,
      reviewNote: note.trim().slice(0, 500) || null,
      updatedAt: now,
    })
    .where(and(eq(images.id, imageId), eq(images.status, "pending")))
    .returning({ id: images.id });
  if (updated.length === 0) {
    const [image] = await db
      .select({ status: images.status })
      .from(images)
      .where(eq(images.id, imageId));
    return image
      ? { status: "invalid", message: `This photo is already ${image.status}.` }
      : { status: "not-found" };
  }
  await db.delete(gearItemImages).where(eq(gearItemImages.imageId, imageId));
  await syncPublication(db, [imageId]);
  return { status: "done" };
}

/**
 * Takes a photo off its gear page. Member photos stay on their unit;
 * photos added only for the gear page are deleted.
 */
export async function removeFromGearPage(db: Database, imageId: string) {
  await db.delete(gearItemImages).where(eq(gearItemImages.imageId, imageId));
  const [member] = await db
    .select({ imageId: ownedGearImages.imageId })
    .from(ownedGearImages)
    .where(eq(ownedGearImages.imageId, imageId));
  if (member) await syncPublication(db, [imageId]);
  else await deleteImages(db, [imageId]);
}

/** The review queue, oldest first. */
export async function listPendingImages(db: Database) {
  return db
    .select({
      id: images.id,
      widths: images.widths,
      published: images.published,
      createdAt: images.createdAt,
      uploaderHandle: users.handle,
      offered: ownedGearImages.offeredForGearPage,
      ownedGearId: ownedGear.id,
      brandName: brands.name,
      modelName: gearItems.modelName,
      brandSlug: brands.slug,
      slug: gearItems.slug,
    })
    .from(images)
    .innerJoin(ownedGearImages, eq(ownedGearImages.imageId, images.id))
    .innerJoin(ownedGear, eq(ownedGear.id, ownedGearImages.ownedGearId))
    .innerJoin(gearItems, eq(gearItems.id, ownedGear.gearItemId))
    .innerJoin(brands, eq(brands.id, gearItems.brandId))
    .leftJoin(users, eq(users.id, images.uploaderId))
    .where(eq(images.status, "pending"))
    .orderBy(asc(images.createdAt))
    .limit(100);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type Photo = {
  id: string;
  widths: number[];
  width: number;
  height: number;
  published: boolean;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
};

/** Where to load a photo version from. */
export function photoUrl(
  photo: Pick<Photo, "id" | "published">,
  width: number,
) {
  const cdn = photo.published
    ? getImageStorage().cdnUrl(publicKey(photo.id, width))
    : null;
  return cdn ?? `/api/images/${photo.id}/${width}.webp`;
}

/** `src`, `srcSet`, width and height for an <img>. */
export function photoAttributes(photo: Photo, sizes: string) {
  return {
    src: photoUrl(photo, photo.widths[Math.min(1, photo.widths.length - 1)]!),
    srcSet: photo.widths.map((w) => `${photoUrl(photo, w)} ${w}w`).join(", "),
    sizes,
    width: photo.width,
    height: photo.height,
  };
}

const photoColumns = {
  id: images.id,
  widths: images.widths,
  width: images.width,
  height: images.height,
  published: images.published,
  status: images.status,
  reviewNote: images.reviewNote,
};

/** Photos of units, in order. Callers decide who sees pending ones. */
export async function photosOfUnits(db: Database, ownedGearIds: string[]) {
  if (ownedGearIds.length === 0)
    return new Map<string, (Photo & { offered: boolean })[]>();
  const rows = await db
    .select({
      ...photoColumns,
      ownedGearId: ownedGearImages.ownedGearId,
      offered: ownedGearImages.offeredForGearPage,
    })
    .from(ownedGearImages)
    .innerJoin(images, eq(images.id, ownedGearImages.imageId))
    .where(inArray(ownedGearImages.ownedGearId, ownedGearIds))
    .orderBy(asc(ownedGearImages.sort), asc(images.createdAt));
  const byUnit = new Map<string, (Photo & { offered: boolean })[]>();
  for (const { ownedGearId, ...photo } of rows) {
    byUnit.set(ownedGearId, [...(byUnit.get(ownedGearId) ?? []), photo]);
  }
  return byUnit;
}

export type GearPagePhoto = Photo & {
  source: "user_upload" | "brand_provided" | "cc" | "house";
  license: string;
  attribution: string | null;
  sourceUrl: string | null;
  uploaderHandle: string | null;
};

/** Approved photos on a gear page, with their credits. */
export async function gearPagePhotos(
  db: Database,
  gearItemId: string,
): Promise<GearPagePhoto[]> {
  return db
    .select({
      ...photoColumns,
      source: images.source,
      license: images.license,
      attribution: images.attribution,
      sourceUrl: images.sourceUrl,
      uploaderHandle: users.handle,
    })
    .from(gearItemImages)
    .innerJoin(images, eq(images.id, gearItemImages.imageId))
    .leftJoin(users, eq(users.id, images.uploaderId))
    .where(
      and(
        eq(gearItemImages.gearItemId, gearItemId),
        eq(images.status, "approved"),
      ),
    )
    .orderBy(asc(gearItemImages.sort));
}

/**
 * Whether this viewer may load this photo, and its stored widths. Used by
 * the route that serves photos that aren't on the CDN.
 */
export async function loadViewablePhoto(
  db: Database,
  viewer: Viewer | null,
  imageId: string,
): Promise<{ widths: number[] } | null> {
  if (!z.uuid().safeParse(imageId).success) return null;
  const [image] = await db
    .select({
      status: images.status,
      uploaderId: images.uploaderId,
      widths: images.widths,
    })
    .from(images)
    .where(eq(images.id, imageId));
  if (!image) return null;

  const onGearPages = await db
    .select({ status: gearItems.status, createdBy: gearItems.createdBy })
    .from(gearItemImages)
    .innerJoin(gearItems, eq(gearItems.id, gearItemImages.gearItemId))
    .where(eq(gearItemImages.imageId, imageId));
  const units = await db
    .select({
      userId: ownedGear.userId,
      visibility: ownedGear.visibility,
      gearItem: { status: gearItems.status, createdBy: gearItems.createdBy },
    })
    .from(ownedGearImages)
    .innerJoin(ownedGear, eq(ownedGear.id, ownedGearImages.ownedGearId))
    .innerJoin(gearItems, eq(gearItems.id, ownedGear.gearItemId))
    .where(eq(ownedGearImages.imageId, imageId));

  const attachedVisible =
    onGearPages.some((item) => canViewGearItem(viewer, item)) ||
    units.some((unit) => canViewOwnedGear(viewer, unit));
  return canViewImage(viewer, image, attachedVisible)
    ? { widths: image.widths }
    : null;
}

/**
 * The uploads switch in effect. In production, member uploads stay limited
 * to admins until the DMCA designated agent is listed (lib/legal.ts),
 * whatever UPLOADS says.
 */
export function uploadsMode(): UploadsMode {
  const env = getImagesEnv();
  if (env.UPLOADS === "on" && env.IMAGE_STORAGE === "s3" && !DMCA_AGENT) {
    return "admins";
  }
  return env.UPLOADS;
}
