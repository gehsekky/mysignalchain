/** Slugs and search text for catalog entries. */

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** "Big Muff Pi" -> "big-muff-pi", "'65 Deluxe Reverb" -> "65-deluxe-reverb". */
export function slugify(value: string): string {
  return fold(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** Lowercase words separated by single spaces; punctuation becomes a space. */
export function normalizeSearch(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The text that search matches against: brand, model and aliases, plus each
 * model name and alias with its spaces removed, so "ds1" finds "DS-1" and
 * "ts 9" finds "TS9".
 */
export function buildSearchText(
  brandName: string,
  modelName: string,
  aliases: readonly string[] = [],
): string {
  const words = [brandName, modelName, ...aliases].map(normalizeSearch);
  const compact = [modelName, ...aliases]
    .map((name) => normalizeSearch(name).replace(/ /g, ""))
    .filter((name) => !words.includes(name));
  return [...new Set([...words, ...compact])].filter(Boolean).join(" ");
}

/** Reads "boss/sd-1", "/gear/boss/sd-1" or a full gear page URL. */
export function parseGearReference(
  value: string,
): { brand: string; model: string } | null {
  const parts = value
    .trim()
    .replace(/^https?:\/\/[^/]+/, "")
    .split(/[/?#]/)
    .filter(Boolean);
  const start = parts[0] === "gear" ? 1 : 0;
  const [brand, model] = parts.slice(start, start + 2);
  return brand && model ? { brand, model } : null;
}
