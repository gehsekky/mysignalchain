/**
 * Loads the seed catalog (lib/catalog/seed) into the database. Runs on every
 * deploy after migrations, and locally with `npm run catalog:sync`.
 */
import { syncCatalog } from "@/lib/catalog/sync";
import { brands, categories, seedItems } from "@/lib/catalog/seed";
import { createDb } from "@/lib/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  try {
    const result = await syncCatalog(db, {
      brands,
      categories,
      items: seedItems,
    });
    console.log(
      `Catalog synced: ${result.added.length} added, ${result.updated.length} updated, ${result.unchanged} unchanged`,
    );
    for (const name of result.added) console.log(`  added ${name}`);
    for (const name of result.updated) console.log(`  updated ${name}`);
    for (const name of result.conflicts) {
      console.warn(
        `  skipped ${name}: a user-submitted item already has that slug`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
