import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { brands, categories, seedItems } from "@/lib/catalog/seed";
import { mergeItem } from "@/lib/catalog/moderate";
import { getGearItem } from "@/lib/catalog/queries";
import { submitGear } from "@/lib/catalog/submit";
import { syncCatalog } from "@/lib/catalog/sync";
import {
  addOwnedGear,
  ADDS_PER_DAY,
  getOwnedGear,
  listFinishes,
  listOwnedGear,
  updateOwnedGear,
} from "@/lib/collection";
import { createDb } from "@/lib/db/client";
import { gearItemImages, images, ownedGear, users } from "@/lib/db/schema";
import {
  changeHandle,
  nextHandleChangeAt,
  resolveOldHandle,
} from "@/lib/handles/change";
import {
  approveImage,
  deleteOwnPhoto,
  finishUpload,
  gearPagePhotos,
  loadViewablePhoto,
  MAX_PHOTOS_PER_UNIT,
  photosOfUnits,
  rejectImage,
  removeOwnedGear,
  startUpload,
  syncOwnedGearPhotos,
} from "@/lib/images";
import { FileStorage, setImageStorage } from "@/lib/images/storage";
import { completeOnboarding } from "@/lib/onboarding/complete";
import { getProfile, updateProfile } from "@/lib/profile";
import type { Viewer } from "@/lib/policy";

const { db, pool } = createDb(process.env.DATABASE_URL!);
const seed = { brands, categories, items: seedItems };
let imageDir: string;

const DAY = 24 * 60 * 60 * 1000;

async function createUser(id: string, role: "user" | "admin" = "user") {
  await db.insert(users).values({
    id,
    name: id,
    email: `${id}@example.com`,
    handle: id,
    ageCheckPassedAt: new Date(),
    role,
  });
}

const viewer = (id: string, role: "user" | "admin" = "user"): Viewer => ({
  id,
  handle: id,
  ageCheckPassedAt: new Date(),
  role,
});

async function itemId(brandSlug: string, slug: string) {
  const item = await getGearItem(db, brandSlug, slug);
  if (!item) throw new Error(`no item ${brandSlug}/${slug}`);
  return { ...item, finishes: await listFinishes(db, item.id) };
}

/** A JPEG with GPS coordinates and a camera model in its EXIF. */
function photoWithGps(width = 1600, height = 1000) {
  return sharp({
    create: { width, height, channels: 3, background: "#c33" },
  })
    .withExif({
      IFD0: { Make: "TestCam", Model: "Secret Model" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "40/1 26/1 46/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "79/1 58/1 56/1",
      },
    })
    .jpeg()
    .toBuffer();
}

async function upload(
  userId: string,
  ownedGearId: string,
  file?: Buffer,
  offered = false,
) {
  const start = await startUpload(db, userId, { kind: "owned", ownedGearId });
  if (start.status !== "ok") return start;
  // Stand in for the browser posting the file.
  const storage = new FileStorage(imageDir);
  await storage.put(start.ticket.key, file ?? (await photoWithGps()));
  return finishUpload(db, userId, {
    ticket: start.ticket,
    target: { kind: "owned", ownedGearId },
    offered,
  });
}

async function files() {
  const list = async (dir: string): Promise<string[]> => {
    try {
      const entries = await readdir(path.join(imageDir, dir), {
        recursive: true,
        withFileTypes: true,
      });
      return entries
        .filter((e) => e.isFile())
        .map((e) => path.relative(imageDir, path.join(e.parentPath, e.name)))
        .sort();
    } catch {
      return [];
    }
  };
  return {
    private: await list("private"),
    public: await list("public"),
    incoming: await list("incoming"),
  };
}

beforeAll(async () => {
  imageDir = await mkdtemp(path.join(tmpdir(), "msc-images-"));
  setImageStorage(new FileStorage(imageDir));
});

beforeEach(async () => {
  await db.execute(
    sql`truncate gear_items, brands, gear_categories, users, images restart identity cascade`,
  );
  await rm(imageDir, { recursive: true, force: true });
  await syncCatalog(db, seed);
  await createUser("alice");
  await createUser("bob");
  await createUser("admin", "admin");
});

afterAll(async () => {
  setImageStorage(undefined);
  await rm(imageDir, { recursive: true, force: true });
  await pool.end();
});

describe("handle changes", () => {
  it("redirects old handles, reserves them, and limits changes to one per 30 days", async () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(await changeHandle(db, "alice", "Alice-Plays", now)).toEqual({
      status: "changed",
      handle: "alice-plays",
    });
    expect(await resolveOldHandle(db, "alice")).toBe("alice-plays");
    expect(await getProfile(db, "alice")).toBeNull();
    expect((await getProfile(db, "alice-plays"))?.id).toBe("alice");

    // Someone else can't take the old handle, by changing or onboarding.
    const later = new Date(now.getTime() + 31 * DAY);
    expect(await changeHandle(db, "bob", "alice", now)).toEqual({
      status: "taken",
    });
    await db.insert(users).values({
      id: "carol",
      name: "carol",
      email: "carol@example.com",
    });
    expect(
      await completeOnboarding(db, "carol", {
        handle: "alice",
        birthMonth: 1,
        birthYear: 1990,
      }),
    ).toEqual({ status: "handle-taken" });

    // Too soon for alice, then fine after 30 days, and she can take back her old handle.
    const soon = new Date(now.getTime() + 10 * DAY);
    const tooSoon = await changeHandle(db, "alice", "alice", soon);
    expect(tooSoon.status).toBe("too-soon");
    expect(await nextHandleChangeAt(db, "alice", soon)).toEqual(
      new Date(now.getTime() + 30 * DAY),
    );
    expect(await changeHandle(db, "alice", "alice", later)).toEqual({
      status: "changed",
      handle: "alice",
    });
    expect(await resolveOldHandle(db, "alice")).toBeNull();
    expect(await resolveOldHandle(db, "alice-plays")).toBe("alice");
  });

  it("rejects taken, blocked and badly formed handles", async () => {
    expect(await changeHandle(db, "alice", "bob")).toEqual({ status: "taken" });
    expect((await changeHandle(db, "alice", "admin")).status).toBe("invalid");
    expect((await changeHandle(db, "alice", "-x-")).status).toBe("invalid");
    expect(await changeHandle(db, "alice", "ALICE")).toEqual({
      status: "unchanged",
    });
  });

  it("saves a display name and bio, cleaned up", async () => {
    expect(
      await updateProfile(db, "alice", {
        displayName: "  Alice   Smith ",
        bio: "Plays\nfuzz",
      }),
    ).toEqual({ status: "saved" });
    expect(await getProfile(db, "alice")).toMatchObject({
      displayName: "Alice Smith",
      bio: "Plays fuzz",
    });
    const tooLong = await updateProfile(db, "alice", {
      displayName: "Alice",
      bio: "x".repeat(161),
    });
    expect(tooLong.status).toBe("invalid");
  });
});

describe("collections", () => {
  it("adds units privately by default, with a listed or custom finish", async () => {
    const strat = await itemId(
      "fender",
      "american-professional-ii-stratocaster",
    );
    const sd1 = await itemId("boss", "sd-1");
    expect(sd1.finishes.length).toBeGreaterThanOrEqual(0);

    const custom = await addOwnedGear(db, "alice", strat.id, {
      status: "owned",
      finish: "other",
      customFinish: "Relic sunburst",
      nickname: "Old faithful",
    });
    expect(custom.status).toBe("saved");
    const unit = await getOwnedGear(db, (custom as { id: string }).id);
    expect(unit).toMatchObject({
      visibility: "private",
      customFinish: "Relic sunburst",
      finishId: null,
      nickname: "Old faithful",
    });

    // "Other" needs a description; a finish must belong to the item.
    expect(
      (
        await addOwnedGear(db, "alice", strat.id, {
          status: "owned",
          finish: "other",
        })
      ).status,
    ).toBe("invalid");
    const amp = await itemId("marshall", "jcm800-2203");
    const ampFinish = amp.finishes[0];
    expect(ampFinish).toBeDefined();
    const wrong = await addOwnedGear(db, "alice", strat.id, {
      status: "owned",
      finish: ampFinish!.id,
    });
    expect(wrong).toMatchObject({
      status: "invalid",
      fieldErrors: { finish: expect.any(Array) },
    });
    const listed = await addOwnedGear(db, "alice", amp.id, {
      status: "wishlist",
      finish: ampFinish!.id,
      visibility: "public",
    });
    expect(listed.status).toBe("saved");

    const mine = await listOwnedGear(db, "alice");
    expect(
      mine.map((u) => [
        u.gearItem.slug,
        u.status,
        u.finishName ?? u.customFinish,
      ]),
    ).toEqual([
      ["american-professional-ii-stratocaster", "owned", "Relic sunburst"],
      ["jcm800-2203", "wishlist", ampFinish!.name],
    ]);

    // Only the owner can update.
    const id = (custom as { id: string }).id;
    expect(
      (await updateOwnedGear(db, "bob", id, { status: "sold" })).status,
    ).toBe("not-found");
    expect(
      (
        await updateOwnedGear(db, "alice", id, {
          status: "sold",
          visibility: "public",
        })
      ).status,
    ).toBe("saved");
    expect(await getOwnedGear(db, id)).toMatchObject({
      status: "sold",
      visibility: "public",
      customFinish: null,
    });
  });

  it("limits adds per day", async () => {
    const sd1 = await itemId("boss", "sd-1");
    const now = new Date();
    await db.insert(ownedGear).values(
      Array.from({ length: ADDS_PER_DAY }, () => ({
        userId: "alice",
        gearItemId: sd1.id,
        status: "owned" as const,
        createdAt: now,
      })),
    );
    expect(
      (await addOwnedGear(db, "alice", sd1.id, { status: "owned" })).status,
    ).toBe("limit");
  });

  it("moves units to the merge target, keeping finishes by name", async () => {
    const amp = await itemId("marshall", "jcm800-2203");
    const finishName = amp.finishes[0]!.name;
    const submitted = await submitGear(db, "bob", {
      brandName: "Marshall",
      modelName: "JCM800 dup",
      categorySlug: "head",
      template: "amp",
      finishes: `${finishName.toUpperCase()}\nMidnight Blue`,
    });
    expect(submitted.status).toBe("submitted");
    const dup = await itemId("marshall", "jcm800-dup");
    const same = dup.finishes.find((f) => f.name !== "Midnight Blue")!;
    const other = dup.finishes.find((f) => f.name === "Midnight Blue")!;
    const a = await addOwnedGear(db, "bob", dup.id, {
      status: "owned",
      finish: same.id,
    });
    const b = await addOwnedGear(db, "bob", dup.id, {
      status: "owned",
      finish: other.id,
    });
    const c = await addOwnedGear(db, "bob", dup.id, {
      status: "owned",
      finish: "other",
      customFinish: "Tolex repaint",
    });

    expect(await mergeItem(db, "admin", dup.id, amp.id)).toEqual({
      status: "done",
    });
    const units = await Promise.all(
      [a, b, c].map((r) => getOwnedGear(db, (r as { id: string }).id)),
    );
    expect(
      units.map((u) => [u!.gearItem.id, u!.finishName, u!.customFinish]),
    ).toEqual([
      [amp.id, finishName, null],
      [amp.id, null, "Midnight Blue"],
      [amp.id, null, "Tolex repaint"],
    ]);
  });

  it("keeps a finish's name on units when the seed drops that finish", async () => {
    const amp = await itemId("marshall", "jcm800-2203");
    const finish = amp.finishes[0]!;
    const added = await addOwnedGear(db, "alice", amp.id, {
      status: "owned",
      finish: finish.id,
    });
    const items = seedItems.map((item) =>
      item.brand === "marshall" && item.slug === "jcm800-2203"
        ? { ...item, finishes: [] }
        : item,
    );
    await syncCatalog(db, { brands, categories, items });
    expect(await getOwnedGear(db, (added as { id: string }).id)).toMatchObject({
      finishId: null,
      customFinish: finish.name,
    });
  });
});

describe("photos", () => {
  async function unit(
    userId = "alice",
    visibility: "private" | "public" = "public",
  ) {
    const sd1 = await itemId("boss", "sd-1");
    const added = await addOwnedGear(db, userId, sd1.id, {
      status: "owned",
      visibility,
    });
    return { id: (added as { id: string }).id, gearItemId: sd1.id };
  }

  it("strips GPS and other metadata, stores resized WebP versions and deletes the upload", async () => {
    const { id } = await unit();
    const result = await upload("alice", id);
    expect(result.status).toBe("ok");
    const imageId = (result as { imageId: string }).imageId;

    const stored = await files();
    expect(stored.incoming).toEqual([]);
    expect(stored.private).toEqual([
      `private/${imageId}/1200.webp`,
      `private/${imageId}/1600.webp`,
      `private/${imageId}/400.webp`,
    ]);
    expect(stored.public).toEqual([]);
    for (const file of stored.private) {
      const meta = await sharp(path.join(imageDir, file)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    }
    const [row] = await db.select().from(images).where(eq(images.id, imageId));
    expect(row).toMatchObject({
      status: "pending",
      published: false,
      source: "user_upload",
      width: 1600,
      height: 1000,
      widths: [400, 1200, 1600],
    });
  });

  it("rejects files that aren't photos, and tiny ones", async () => {
    const { id } = await unit();
    expect(
      await upload("alice", id, Buffer.from("not an image")),
    ).toMatchObject({
      status: "rejected",
    });
    const tiny = await sharp({
      create: { width: 50, height: 50, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(await upload("alice", id, tiny)).toMatchObject({
      status: "rejected",
    });
    const gif = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#fff" },
    })
      .gif()
      .toBuffer();
    expect(await upload("alice", id, gif)).toMatchObject({
      status: "rejected",
    });
    expect((await files()).incoming).toEqual([]);
  });

  it("refuses uploads to someone else's unit, forged tickets and too many photos", async () => {
    const { id } = await unit();
    expect(
      await startUpload(db, "bob", { kind: "owned", ownedGearId: id }),
    ).toMatchObject({
      status: "rejected",
    });
    const start = await startUpload(db, "alice", {
      kind: "owned",
      ownedGearId: id,
    });
    if (start.status !== "ok") throw new Error("expected a ticket");
    await new FileStorage(imageDir).put(start.ticket.key, await photoWithGps());
    expect(
      await finishUpload(db, "bob", {
        ticket: start.ticket,
        target: { kind: "owned", ownedGearId: id },
      }),
    ).toMatchObject({ status: "rejected" });

    const sd1 = await itemId("boss", "sd-1");
    await db
      .insert(images)
      .values(
        Array.from({ length: MAX_PHOTOS_PER_UNIT }, () => ({
          uploaderId: "alice",
          widths: [400],
          width: 400,
          height: 300,
          source: "user_upload" as const,
          license: "x",
          status: "pending" as const,
        })),
      )
      .returning({ id: images.id })
      .then((rows) =>
        db.execute(sql`insert into owned_gear_images (image_id, owned_gear_id)
        select id, ${id}::uuid from images where id in (${sql.join(
          rows.map((r) => sql`${r.id}::uuid`),
          sql`, `,
        )})`),
      );
    expect(sd1).toBeDefined();
    expect(
      await startUpload(db, "alice", { kind: "owned", ownedGearId: id }),
    ).toMatchObject({
      status: "rejected",
      message: expect.stringContaining(`${MAX_PHOTOS_PER_UNIT} photos`),
    });
  });

  it("shows a pending photo only to its uploader and admins, and publishes it once approved", async () => {
    const { id, gearItemId } = await unit("alice", "public");
    const imageId = (
      (await upload("alice", id, undefined, true)) as { imageId: string }
    ).imageId;

    expect(
      await loadViewablePhoto(db, viewer("alice"), imageId),
    ).not.toBeNull();
    expect(
      await loadViewablePhoto(db, viewer("admin", "admin"), imageId),
    ).not.toBeNull();
    expect(await loadViewablePhoto(db, viewer("bob"), imageId)).toBeNull();
    expect(await loadViewablePhoto(db, null, imageId)).toBeNull();

    expect(
      await approveImage(db, "admin", imageId, { useOnGearPage: true }),
    ).toEqual({
      status: "done",
    });
    expect(await loadViewablePhoto(db, null, imageId)).not.toBeNull();
    expect((await files()).public).toHaveLength(3);
    expect(
      (await gearPagePhotos(db, gearItemId)).map((p) => [
        p.id,
        p.uploaderHandle,
      ]),
    ).toEqual([[imageId, "alice"]]);

    // Making the unit private unpublishes the photo from the collection,
    // but it stays on the gear page it was offered for.
    await updateOwnedGear(db, "alice", id, {
      status: "owned",
      visibility: "private",
    });
    await syncOwnedGearPhotos(db, id);
    expect((await files()).public).toHaveLength(3);
  });

  it("unpublishes when a unit goes private, and won't use unoffered photos on gear pages", async () => {
    const { id, gearItemId } = await unit("alice", "public");
    const imageId = ((await upload("alice", id)) as { imageId: string })
      .imageId;
    expect(
      await approveImage(db, "admin", imageId, { useOnGearPage: true }),
    ).toMatchObject({
      status: "invalid",
    });
    expect(
      await approveImage(db, "admin", imageId, { useOnGearPage: false }),
    ).toEqual({
      status: "done",
    });
    expect(await gearPagePhotos(db, gearItemId)).toEqual([]);
    expect((await files()).public).toHaveLength(3);

    await updateOwnedGear(db, "alice", id, {
      status: "owned",
      visibility: "private",
    });
    await syncOwnedGearPhotos(db, id);
    expect((await files()).public).toEqual([]);
    expect(await loadViewablePhoto(db, null, imageId)).toBeNull();
    expect(
      await loadViewablePhoto(db, viewer("alice"), imageId),
    ).not.toBeNull();
  });

  it("rejects with a note the uploader sees, and deletes everything on removal", async () => {
    const { id } = await unit();
    const first = ((await upload("alice", id)) as { imageId: string }).imageId;
    const second = ((await upload("alice", id)) as { imageId: string }).imageId;
    expect(await rejectImage(db, "admin", first, "Not this pedal")).toEqual({
      status: "done",
    });
    const photos = (await photosOfUnits(db, [id])).get(id)!;
    expect(photos.map((p) => [p.id, p.status, p.reviewNote])).toEqual([
      [first, "rejected", "Not this pedal"],
      [second, "pending", null],
    ]);

    expect(await deleteOwnPhoto(db, "bob", first)).toBe(false);
    expect(await deleteOwnPhoto(db, "alice", first)).toBe(true);
    expect((await files()).private.some((f) => f.includes(first))).toBe(false);

    expect(await removeOwnedGear(db, "bob", id)).toBe(false);
    expect(await removeOwnedGear(db, "alice", id)).toBe(true);
    expect(await files()).toEqual({ private: [], public: [], incoming: [] });
    expect(await db.select().from(images)).toEqual([]);
    expect(await db.select().from(gearItemImages)).toEqual([]);
  });
});
