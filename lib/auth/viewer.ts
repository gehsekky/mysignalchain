import { headers } from "next/headers";
import type { Viewer } from "@/lib/policy";
import { getAuth } from "./index";

/** The signed-in user for a request's headers, or null. Used by proxy.ts. */
export async function getViewerFromHeaders(
  requestHeaders: Headers,
): Promise<Viewer | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return {
    id: session.user.id,
    handle: session.user.handle ?? null,
    ageCheckPassedAt: session.user.ageCheckPassedAt ?? null,
    role: session.user.role === "admin" ? "admin" : "user",
  };
}

/** The signed-in user for this request, or null. */
export async function getViewer(): Promise<Viewer | null> {
  // Read headers first: during a build this defers rendering to request time,
  // so the build never needs auth secrets or a database.
  return getViewerFromHeaders(await headers());
}
