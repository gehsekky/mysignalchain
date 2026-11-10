/**
 * Runs before gear item pages and the admin pages render, so missing or
 * hidden items get a real 404 and merged items a real 308. Pages stream, and
 * a streamed response is already 200 by the time the page itself could call
 * notFound() or redirect(). The pages still repeat these checks.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getViewerFromHeaders } from "@/lib/auth/viewer";
import { checkGearAccess } from "@/lib/catalog/access";
import { getDb } from "@/lib/db/client";
import { canModerateCatalog } from "@/lib/policy";

export const config = {
  matcher: ["/gear/:brand/:model", "/admin/:path*"],
};

function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL("/not-found-page", request.url), {
    status: 404,
  });
}

export async function proxy(request: NextRequest) {
  const parts = request.nextUrl.pathname.split("/").filter(Boolean);

  if (parts[0] === "admin") {
    const viewer = await getViewerFromHeaders(request.headers);
    return canModerateCatalog(viewer) ? NextResponse.next() : notFound(request);
  }

  const [, brand, model] = parts;
  if (!brand || !model) return NextResponse.next();
  const access = await checkGearAccess(getDb(), brand, model, () =>
    getViewerFromHeaders(request.headers),
  );
  if (access.kind === "redirect") {
    return NextResponse.redirect(new URL(access.to, request.url), 308);
  }
  if (access.kind === "not-found") return notFound(request);
  return NextResponse.next();
}
