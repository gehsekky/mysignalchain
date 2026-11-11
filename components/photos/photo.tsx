import { photoAttributes, type Photo as PhotoData } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * A stored photo with its resized versions. A plain <img>, not next/image:
 * the versions are already resized, and the shared server shouldn't resize
 * images on request.
 */
export function Photo({
  photo,
  alt,
  sizes,
  className,
}: {
  photo: PhotoData;
  alt: string;
  sizes: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      {...photoAttributes(photo, sizes)}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("bg-muted object-cover", className)}
    />
  );
}
