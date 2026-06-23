/**
 * Smoke test for the Bun↔DuckDB binding (ADR-0001 risk).
 *
 * Exercises the full path through the data-access layer against an in-memory
 * database: open → init schema → seed → re-seed (idempotency) → read back.
 * Exits non-zero on any failure so it can gate CI. Touches no on-disk data.
 *
 *   bun run db:smoke
 */
import { EventfulDB, loadSeedVenues } from "../src/lib/db/index.ts";

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(`smoke check failed: ${message}`);
}

const db = await EventfulDB.open(":memory:");
try {
  await db.initSchema();
  assert((await db.schemaVersion()) !== null, "schema version recorded");

  const seeds = loadSeedVenues();
  await db.upsertVenues(seeds);
  assert((await db.countVenues()) === seeds.length, `${seeds.length} venues after first seed`);

  // Re-seeding must not duplicate rows.
  await db.upsertVenues(seeds);
  assert((await db.countVenues()) === seeds.length, "seed is idempotent");

  const venues = await db.listVenues();
  assert(venues[0]?.name === "NRG Stadium", "largest venue reads back first");

  console.log(`Bun↔DuckDB OK — ${venues.length} venues round-tripped (top: ${venues[0].name}).`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  db.close();
}
