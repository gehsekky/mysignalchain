import { z } from "zod";

const authEnvSchema = z.object({
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export function getDatabaseUrl(): string {
  return z.string().min(1).parse(process.env.DATABASE_URL);
}

/** Read on first use rather than at import, so builds don't need secrets. */
export function getAuthEnv() {
  return authEnvSchema.parse(process.env);
}

const imagesEnvSchema = z.discriminatedUnion("IMAGE_STORAGE", [
  // Development and tests: files on disk, served by the app.
  z.object({
    IMAGE_STORAGE: z.literal("fs"),
    IMAGE_DIR: z.string().default(".data/images"),
    UPLOADS: z.enum(["off", "admins", "on"]).default("on"),
  }),
  // Production: the images bucket, published files served by CloudFront.
  z.object({
    IMAGE_STORAGE: z.literal("s3"),
    IMAGES_BUCKET: z.string().min(1),
    IMAGES_REGION: z.string().min(1),
    IMAGES_CDN_URL: z.url(),
    IMAGES_CDN_DISTRIBUTION_ID: z.string().min(1),
    UPLOADS: z.enum(["off", "admins", "on"]).default("off"),
  }),
]);
export type ImagesEnv = z.infer<typeof imagesEnvSchema>;

/** Image storage settings. Without IMAGE_STORAGE, local files are used. */
export function getImagesEnv(): ImagesEnv {
  return imagesEnvSchema.parse({
    IMAGE_STORAGE: "fs",
    ...process.env,
  });
}
