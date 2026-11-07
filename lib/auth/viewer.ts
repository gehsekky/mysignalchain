import { headers } from "next/headers";
import type { Viewer } from "@/lib/policy";
import { getAuth } from "./index";

/** The signed-in user for this request, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    id: session.user.id,
    handle: session.user.handle ?? null,
    ageCheckPassedAt: session.user.ageCheckPassedAt ?? null,
  };
}
