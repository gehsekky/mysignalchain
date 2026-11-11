import { cn } from "@/lib/utils";

/** The first letter of a name, until avatar uploads exist. */
export function LetterAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <div
      aria-hidden
      className={cn(
        "bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
    >
      {letter}
    </div>
  );
}
