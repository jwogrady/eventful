/**
 * Feature 2 — ingestion engine, proven against captured fixtures (no network).
 *
 * Covers the adapter extractors, the priority chain (API feed primary, HTML
 * fallback), idempotent upserts, append-only snapshots, run metrics + health,
 * and the guarantee that re-scrapes never touch curation.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { EventfulDB, loadSeedVenues } from "../src/lib/db/index.ts";
import type { Fetcher } from "../src/lib/ingest/fetch.ts";
import { stableEventKey, titleKey } from "../src/lib/ingest/key.ts";
import { runIngest } from "../src/lib/ingest/pipeline.ts";
import { adapters } from "../src/lib/ingest/registry.ts";
import {
  parseWoodlandsApi,
  parseWoodlandsHtml,
  woodlandsAdapter,
} from "../src/lib/ingest/adapters/woodlands.ts";

const VENUE_ID = "cynthia-woods-mitchell-pavilion";
const TODAY = "2026-06-23"; // the fixture capture date
const API_BODY = readFileSync(`${import.meta.dir}/fixtures/woodlands-api.json`, "utf8");
const HTML_BODY = readFileSync(`${import.meta.dir}/fixtures/woodlands-events.html`, "utf8");

/** A fetcher served entirely from fixtures. `apiOk: false` forces the fallback. */
function fixtureFetcher(opts: { apiOk?: boolean } = {}): Fetcher {
  const apiOk = opts.apiOk ?? true;
  return async (url) => {
    if (url.includes("cwdata")) {
      return apiOk
        ? { url, status: 200, ok: true, contentType: "application/json", body: API_BODY }
        : { url, status: 503, ok: false, contentType: null, body: "" };
    }
    if (url.endsWith("/events")) {
      return { url, status: 200, ok: true, contentType: "text/html", body: HTML_BODY };
    }
    return { url, status: 404, ok: false, contentType: null, body: "" };
  };
}

let db: EventfulDB;

beforeEach(async () => {
  db = await EventfulDB.open(":memory:");
  await db.initSchema();
  await db.upsertVenues(loadSeedVenues());
});

afterEach(() => {
  db.close();
});

const ctx = { sourceUrl: "x", today: TODAY };

test("API extractor returns the 47 upcoming events, filtering past ones", () => {
  const events = parseWoodlandsApi(API_BODY, ctx);
  expect(events).toHaveLength(47);
  expect(events.every((e) => e.date! >= TODAY)).toBe(true);
  // rich fields from the API
  expect(events.some((e) => e.ticketUrl?.includes("ticketmaster.com"))).toBe(true);
  expect(events.every((e) => e.imageUrl)).toBe(true);
});

test("HTML fallback extractor also returns 47 upcoming events", () => {
  const events = parseWoodlandsHtml(HTML_BODY, ctx);
  expect(events).toHaveLength(47);
  expect(events.every((e) => e.title && e.date)).toBe(true);
});

test("adapter declares the feed→html priority order", () => {
  expect(woodlandsAdapter.attempts.map((a) => a.kind)).toEqual(["feed", "html"]);
});

test("event identity is stable, and distinct titles never collide", () => {
  // titles with no sluggable characters still get distinct, non-empty keys
  expect(titleKey("!!!")).not.toBe("");
  expect(titleKey("🎵🎵")).not.toBe("");
  expect(titleKey("!!!")).not.toBe(titleKey("🎵🎵"));
  // same inputs are deterministic
  const k = stableEventKey("v", "2026-07-01", "Boz Scaggs");
  expect(stableEventKey("v", "2026-07-01", "Boz Scaggs")).toBe(k);
  expect(k).toBe("v:2026-07-01:boz-scaggs");
});

test("pipeline ingests via the API feed and records healthy metrics", async () => {
  const [result] = await runIngest(db, adapters, fixtureFetcher(), TODAY);
  expect(result.sourceKind).toBe("feed");
  expect(result.health).toBe("ok");
  expect(result.eventsFound).toBe(47);
  expect(result.eventsUpserted).toBe(47);

  expect(await db.countEvents(VENUE_ID)).toBe(47);
  // API yielded events, so the HTML page is never fetched: one snapshot.
  expect(await db.countSnapshots(VENUE_ID)).toBe(1);

  const run = await db.latestRun(VENUE_ID);
  expect(run?.health).toBe("ok");
  expect(run?.sourceKind).toBe("feed");
});

test("re-running is idempotent for events but snapshots are append-only", async () => {
  await runIngest(db, adapters, fixtureFetcher(), TODAY);
  await runIngest(db, adapters, fixtureFetcher(), TODAY);

  expect(await db.countEvents(VENUE_ID)).toBe(47); // no duplicate events
  expect(await db.countSnapshots(VENUE_ID)).toBe(2); // one capture per run

  const sources = await db.query<{ n: number }>(
    "SELECT count(*)::INTEGER AS n FROM event_sources WHERE venue_id = $1",
    [VENUE_ID],
  );
  expect(sources[0].n).toBe(47); // provenance replaced, not duplicated
});

test("falls back to HTML scraping when the API is down", async () => {
  const [result] = await runIngest(db, adapters, fixtureFetcher({ apiOk: false }), TODAY);
  expect(result.sourceKind).toBe("html");
  expect(result.eventsUpserted).toBe(47);
  expect(await db.countEvents(VENUE_ID)).toBe(47);
  // both URLs were fetched (failed API + HTML), so two snapshots
  expect(await db.countSnapshots(VENUE_ID)).toBe(2);
});

test("re-scrapes never clobber curation state", async () => {
  await runIngest(db, adapters, fixtureFetcher(), TODAY);
  const [{ id }] = await db.query<{ id: string }>("SELECT id FROM events LIMIT 1");
  await db.query("INSERT INTO shortlist (event_id) VALUES ($1)", [id]);
  await db.query("INSERT INTO notes (event_id, body) VALUES ($1, 'go to this one')", [id]);

  await runIngest(db, adapters, fixtureFetcher(), TODAY);

  const shortlist = await db.query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM shortlist");
  const notes = await db.query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM notes");
  expect(shortlist[0].n).toBe(1);
  expect(notes[0].n).toBe(1);
});
