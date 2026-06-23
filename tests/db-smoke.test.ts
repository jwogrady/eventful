/**
 * Proves the Bun↔DuckDB binding and the data-access layer work end to end
 * (ADR-0001 risk). Runs entirely in-memory — no on-disk database required.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { EventfulDB, loadSeedVenues } from "../src/lib/db/index.ts";

let db: EventfulDB;

beforeAll(async () => {
  db = await EventfulDB.open(":memory:");
  await db.initSchema();
});

afterAll(() => {
  db.close();
});

test("schema initializes with a recorded version", async () => {
  expect(await db.schemaVersion()).toBe(1);
});

test("all eight planned tables exist", async () => {
  const rows = await db.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
  );
  const names = rows.map((r) => r.table_name);
  for (const t of [
    "venues",
    "raw_snapshots",
    "events",
    "event_sources",
    "shortlist",
    "hidden",
    "tags",
    "notes",
  ]) {
    expect(names).toContain(t);
  }
});

test("seed loads all 10 venues and round-trips", async () => {
  const seeds = loadSeedVenues();
  expect(seeds).toHaveLength(10);

  await db.upsertVenues(seeds);
  expect(await db.countVenues()).toBe(10);

  const venues = await db.listVenues();
  expect(venues[0].name).toBe("NRG Stadium");
  expect(venues[0].capacity).toBe(72000);
});

test("re-seeding is idempotent", async () => {
  const seeds = loadSeedVenues();
  await db.upsertVenues(seeds);
  await db.upsertVenues(seeds);
  expect(await db.countVenues()).toBe(10);
});
