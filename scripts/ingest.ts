/**
 * Run the ingestion pipeline over every registered venue adapter.
 * Intended to be invoked on a schedule by system cron (see README).
 *
 *   bun run ingest
 *
 * Ensures the schema and seed venues exist first (events FK to venues). Exits
 * non-zero if any source is broken, so cron/monitoring can flag it.
 */
import { EventfulDB, loadSeedVenues } from "../src/lib/db/index.ts";
import { createFetcher } from "../src/lib/ingest/fetch.ts";
import { runIngest } from "../src/lib/ingest/pipeline.ts";
import { adapters } from "../src/lib/ingest/registry.ts";

const db = await EventfulDB.open();
try {
  await db.initSchema();
  await db.upsertVenues(loadSeedVenues());

  const results = await runIngest(db, adapters, createFetcher());

  for (const r of results) {
    const via = r.sourceKind ?? "none";
    const err = r.error ? ` — ${r.error}` : "";
    console.log(
      `${r.venueId}: ${r.health} — ${r.eventsUpserted}/${r.eventsFound} events ` +
        `via ${via} (HTTP ${r.httpStatus ?? "-"})${err}`,
    );
  }

  if (results.some((r) => r.health === "broken")) {
    process.exitCode = 1; // flag breakage to the scheduler
  }
} finally {
  db.close();
}
