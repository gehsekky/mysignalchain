/**
 * Where image files live. Keys:
 *
 * - `incoming/{random}`: an upload before processing; deleted right after,
 *   and the bucket expires leftovers after a day.
 * - `private/{imageId}/{width}.webp`: every stored version. Not reachable by
 *   CloudFront; the app serves these after a policy check.
 * - `public/{imageId}/{width}.webp`: copies of published photos, served by
 *   CloudFront. Removing them also invalidates the CDN cache.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getAuthEnv, getImagesEnv, type ImagesEnv } from "@/lib/env";
import { MAX_UPLOAD_BYTES } from "./process";

export type PresignedUpload = { url: string; fields: Record<string, string> };

export interface ImageStorage {
  /** A form the browser posts the file to, for this key only. */
  presignUpload(key: string): Promise<PresignedUpload>;
  get(key: string): Promise<Buffer | null>;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
  /** Stops the CDN serving these public keys. */
  invalidate(keys: string[]): Promise<void>;
  /** The CDN address of a public key, or null when the app serves it. */
  cdnUrl(key: string): string | null;
}

const UPLOAD_SECONDS = 5 * 60;

class S3Storage implements ImageStorage {
  private s3: S3Client;
  private cloudfront: CloudFrontClient;
  constructor(private env: Extract<ImagesEnv, { IMAGE_STORAGE: "s3" }>) {
    this.s3 = new S3Client({ region: env.IMAGES_REGION });
    this.cloudfront = new CloudFrontClient({ region: "us-east-1" });
  }

  async presignUpload(key: string) {
    return createPresignedPost(this.s3, {
      Bucket: this.env.IMAGES_BUCKET,
      Key: key,
      Conditions: [
        ["content-length-range", 1, MAX_UPLOAD_BYTES],
        ["starts-with", "$Content-Type", "image/"],
      ],
      Expires: UPLOAD_SECONDS,
    });
  }

  async get(key: string) {
    try {
      const out = await this.s3.send(
        new GetObjectCommand({ Bucket: this.env.IMAGES_BUCKET, Key: key }),
      );
      if ((out.ContentLength ?? 0) > MAX_UPLOAD_BYTES) return null;
      return Buffer.from(await out.Body!.transformToByteArray());
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async put(key: string, data: Buffer, contentType: string) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.env.IMAGES_BUCKET,
        Key: key,
        Body: data,
        ContentType: contentType,
        // Keys never change content: a new photo gets a new id.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async copy(from: string, to: string) {
    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.env.IMAGES_BUCKET,
        CopySource: `${this.env.IMAGES_BUCKET}/${from}`,
        Key: to,
      }),
    );
  }

  async delete(keys: string[]) {
    if (keys.length === 0) return;
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.env.IMAGES_BUCKET,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  async invalidate(keys: string[]) {
    if (keys.length === 0) return;
    await this.cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: this.env.IMAGES_CDN_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `${Date.now()}-${keys[0]}`,
          Paths: { Quantity: keys.length, Items: keys.map((k) => `/${k}`) },
        },
      }),
    );
  }

  cdnUrl(key: string) {
    return `${this.env.IMAGES_CDN_URL.replace(/\/$/, "")}/${key}`;
  }
}

/**
 * Local files for development and tests. Uploads go to a test-only route
 * that checks a signature standing in for S3's presigned form.
 */
export class FileStorage implements ImageStorage {
  constructor(private root: string) {}

  private file(key: string) {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error("Bad image key");
    }
    return resolved;
  }

  async presignUpload(key: string) {
    const expires = String(Date.now() + UPLOAD_SECONDS * 1000);
    return {
      url: "/api/test/upload",
      fields: { key, expires, signature: signLocalUpload(key, expires) },
    };
  }

  async get(key: string) {
    try {
      return await readFile(this.file(key));
    } catch {
      return null;
    }
  }

  async put(key: string, data: Buffer) {
    await mkdir(path.dirname(this.file(key)), { recursive: true });
    await writeFile(this.file(key), data);
  }

  async copy(from: string, to: string) {
    await mkdir(path.dirname(this.file(to)), { recursive: true });
    await copyFile(this.file(from), this.file(to));
  }

  async delete(keys: string[]) {
    await Promise.all(keys.map((key) => rm(this.file(key), { force: true })));
  }

  async invalidate() {}

  cdnUrl() {
    return null;
  }
}

function localUploadMac(key: string, expires: string) {
  return createHmac("sha256", `local-upload:${getAuthEnv().BETTER_AUTH_SECRET}`)
    .update(`${key}\n${expires}`)
    .digest("base64url");
}

export function signLocalUpload(key: string, expires: string) {
  return localUploadMac(key, expires);
}

export function verifyLocalUpload(
  key: string,
  expires: string,
  signature: string,
): boolean {
  if (!(Number(expires) > Date.now())) return false;
  const expected = Buffer.from(localUploadMac(key, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

let cached: ImageStorage | undefined;

export function getImageStorage(): ImageStorage {
  if (cached) return cached;
  const env = getImagesEnv();
  cached =
    env.IMAGE_STORAGE === "s3"
      ? new S3Storage(env)
      : new FileStorage(path.resolve(env.IMAGE_DIR));
  return cached;
}

/** For tests: use this storage instead of the configured one. */
export function setImageStorage(storage: ImageStorage | undefined) {
  cached = storage;
}
