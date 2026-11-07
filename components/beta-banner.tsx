/** Shown until launch. Remove at launch (M7). */
export function BetaBanner() {
  return (
    <p
      role="note"
      className="bg-muted text-muted-foreground px-4 py-2 text-center text-sm"
    >
      This is a beta and data may be wiped.
    </p>
  );
}
