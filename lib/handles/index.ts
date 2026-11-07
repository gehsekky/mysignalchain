import { z } from "zod";

/** Names that could impersonate the site or its staff. */
const BLOCKED_HANDLES = new Set([
  "abuse",
  "admin",
  "administrator",
  "dmca",
  "help",
  "legal",
  "mod",
  "moderator",
  "mysignalchain",
  "official",
  "root",
  "security",
  "signalchain",
  "staff",
  "support",
  "system",
]);

const HANDLE_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase();
}

export function isBlockedHandle(handle: string): boolean {
  // Removing hyphens also catches variants like "my-signal-chain".
  return BLOCKED_HANDLES.has(handle.replaceAll("-", ""));
}

export const handleSchema = z
  .string()
  .transform(normalizeHandle)
  .pipe(
    z
      .string()
      .min(3, "Handles need at least 3 characters.")
      .max(30, "Handles can have at most 30 characters.")
      .regex(
        HANDLE_FORMAT,
        "Use letters, digits and single hyphens, starting and ending with a letter or digit.",
      )
      .refine((handle) => !isBlockedHandle(handle), {
        message: "That handle isn't available.",
      }),
  );
