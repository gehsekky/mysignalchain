/**
 * Stands in for S3's presigned upload form when images are stored on disk
 * (development and tests). Production builds compile this to a 404.
 */
import { getImagesEnv } from "@/lib/env";
import { MAX_UPLOAD_BYTES } from "@/lib/images/process";
import { getImageStorage, verifyLocalUpload } from "@/lib/images/storage";

export async function POST(request: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    getImagesEnv().IMAGE_STORAGE !== "fs"
  ) {
    return new Response(null, { status: 404 });
  }
  const form = await request.formData();
  const key = String(form.get("key") ?? "");
  const expires = String(form.get("expires") ?? "");
  const signature = String(form.get("signature") ?? "");
  const file = form.get("file");
  if (!verifyLocalUpload(key, expires, signature)) {
    return new Response(null, { status: 403 });
  }
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > MAX_UPLOAD_BYTES
  ) {
    return new Response(null, { status: 400 });
  }
  await getImageStorage().put(
    key,
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
  return new Response(null, { status: 204 });
}
