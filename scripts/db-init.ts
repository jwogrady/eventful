/**
 * Create the Eventful DuckDB database from the versioned schema.
 * Idempotent — safe to re-run. Override the target with EVENTFUL_DB_PATH.
 *
 *   bun run db:init
 */
import { EventfulDB, SCHEMA_VERSION } from "../src/lib/db/index.ts";

const db = await EventfulDB.open();
try {
  await db.initSchema();
  console.log(`Initialized schema v${SCHEMA_VERSION} at ${db.path}`);
} finally {
  db.close();
}
