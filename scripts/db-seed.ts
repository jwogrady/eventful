/**
 * Load the 10 hand-maintained Houston seed venues into the database.
 * Idempotent — re-running upserts by id and never duplicates rows.
 * Ensures the schema exists first, so a fresh `db:seed` works on its own.
 *
 *   bun run db:seed
 */
import { EventfulDB, loadSeedVenues } from "../src/lib/db/index.ts";

const db = await EventfulDB.open();
try {
  await db.initSchema();
  const venues = loadSeedVenues();
  await db.upsertVenues(venues);
  console.log(`Seeded ${venues.length} venues; ${await db.countVenues()} now in ${db.path}`);
} finally {
  db.close();
}
