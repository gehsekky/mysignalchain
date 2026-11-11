/**
 * Serves photos that aren't on the CDN (pending ones, and approved ones on
 * units only some viewers can see), after canViewImage. See lib/images.
 */
import { getViewerFromHeaders } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { loadViewablePhoto } from "@/lib/images";
import { getImageStorage } from "@/lib/images/storage";

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/images/[id]/[file]">,
) {
  const { id, file } = await params;
  const width = Number(/^(\d{2,4})\.webp$/.exec(file)?.[1]);
  const photo = await loadViewablePhoto(
    getDb(),
    await getViewerFromHeaders(request.headers),
    id,
  );
  if (!photo || !photo.widths.includes(width)) {
    return new Response(null, { status: 404 });
  }
  const data = await getImageStorage().get(`private/${id}/${width}.webp`);
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      // Only this browser may keep it, and not for long: access can change.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
