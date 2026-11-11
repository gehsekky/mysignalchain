/**
 * Turns an upload into the WebP files we store. Re-encoding drops all
 * metadata, GPS location included; the original is never kept.
 *
 * The app shares a small instance, so images are processed one at a time
 * and sharp's cache is off.
 */
import sharp, { type Metadata } from "sharp";

sharp.concurrency(1);
sharp.cache(false);

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 50_000_000;
export const MIN_SIDE = 200;
export const TARGET_WIDTHS = [400, 1200, 2048] as const;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class ImageRejected extends Error {}

export type ProcessedImage = {
  width: number;
  height: number;
  versions: { width: number; height: number; data: Buffer }[];
};

/** The widths to store for an image this wide, smallest first. */
export function widthsFor(width: number): number[] {
  const largest = Math.min(width, TARGET_WIDTHS.at(-1)!);
  return [...new Set([...TARGET_WIDTHS.filter((w) => w < largest), largest])];
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs one job at a time, in order. */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export function processImage(input: Buffer): Promise<ProcessedImage> {
  return serial(async () => {
    if (input.byteLength > MAX_UPLOAD_BYTES) {
      throw new ImageRejected("Photos can be up to 15 MB.");
    }
    let meta: Metadata;
    try {
      meta = await sharp(input, {
        limitInputPixels: MAX_INPUT_PIXELS,
      }).metadata();
    } catch {
      throw new ImageRejected("That file isn't a photo we can read.");
    }
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
      throw new ImageRejected("Upload a JPEG, PNG or WebP photo.");
    }
    if (!meta.width || !meta.height) {
      throw new ImageRejected("That file isn't a photo we can read.");
    }
    if (meta.width * meta.height > MAX_INPUT_PIXELS) {
      throw new ImageRejected(
        "That photo is too large; keep it under 50 megapixels.",
      );
    }
    // EXIF orientations 5-8 swap width and height once applied.
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;
    if (Math.min(width, height) < MIN_SIDE) {
      throw new ImageRejected(
        `Photos need to be at least ${MIN_SIDE} pixels on each side.`,
      );
    }

    const versions: ProcessedImage["versions"] = [];
    for (const target of widthsFor(width)) {
      try {
        const { data, info } = await sharp(input, {
          limitInputPixels: MAX_INPUT_PIXELS,
          // Only the first frame of an animated image.
          animated: false,
        })
          .rotate()
          .resize({ width: target, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        versions.push({ width: info.width, height: info.height, data });
      } catch {
        throw new ImageRejected("That file isn't a photo we can read.");
      }
    }
    const largest = versions.at(-1)!;
    return { width: largest.width, height: largest.height, versions };
  });
}
