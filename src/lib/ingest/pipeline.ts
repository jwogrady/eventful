/**
 * Ingestion pipeline (ADR-0005): per source, `fetch → snapshot → extract →
 * upsert`, recording per-source run metrics and a health verdict.
 *
 * Extraction walks the adapter's attempts in priority order (feed → JSON-LD →
 * HTML) and uses the first that yields events. Each distinct URL is fetched and
 * snapshotted once per run. Upserts are idempotent and never touch curation.
 */
import { type EventfulDB, type Health, type ScrapedEvent } from "../db/index.ts";
import type { Fetcher, FetchResult } from "./fetch.ts";
import { stableEventKey } from "./key.ts";
import type { Adapter, RawEvent, SourceKind } from "./types.ts";

export interface AdapterRunResult {
  venueId: string;
  sourceKind: SourceKind | null;
  sourceUrl: string;
  httpStatus: number | null;
  eventsFound: number;
  eventsUpserted: number;
  health: Health;
  error: string | null;
}

const FILL_FIELDS: (keyof RawEvent)[] = [
  "title",
  "date",
  "startsAt",
  "detailUrl",
  "ticketUrl",
  "imageUrl",
  "description",
];

function isFilled(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function countFieldsFilled(events: RawEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const field of FILL_FIELDS) {
    counts[field] = events.filter((e) => isFilled(e[field])).length;
  }
  return counts;
}

function sha256(text: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

/** Compare extracted events against the adapter's declared health expectations. */
function assessHealth(adapter: Adapter, events: RawEvent[], error: string | null): Health {
  if (events.length === 0) return "broken";
  const allRequiredPresent = events.every((e) =>
    adapter.health.requiredFields.every((f) => isFilled(e[f])),
  );
  if (error || events.length < adapter.health.minEvents || !allRequiredPresent) {
    return "degraded";
  }
  return "ok";
}

/** Run one adapter end to end and persist its events, provenance, and metrics. */
export async function runAdapter(
  db: EventfulDB,
  adapter: Adapter,
  fetcher: Fetcher,
  today: string,
): Promise<AdapterRunResult> {
  const startedAt = new Date().toISOString();
  const snapshotIds = new Map<string, number>();
  const fetched = new Map<string, FetchResult>();

  let events: RawEvent[] = [];
  let sourceKind: SourceKind | null = null;
  let sourceUrl = adapter.attempts[0]?.url ?? "";
  let httpStatus: number | null = null;
  let error: string | null = null;

  for (const attempt of adapter.attempts) {
    let result = fetched.get(attempt.url);
    if (!result) {
      try {
        result = await fetcher(attempt.url);
      } catch (err) {
        error = `fetch(${attempt.kind}) failed: ${(err as Error).message}`;
        continue;
      }
      fetched.set(attempt.url, result);
      const snapshotId = await db.insertSnapshot({
        venueId: adapter.venueId,
        sourceUrl: attempt.url,
        httpStatus: result.status,
        contentType: result.contentType,
        contentHash: sha256(result.body),
        body: result.body,
        ok: result.ok,
      });
      snapshotIds.set(attempt.url, snapshotId);
    }

    httpStatus = result.status;
    if (!result.ok) {
      error = `HTTP ${result.status} from ${attempt.url}`;
      continue;
    }

    let parsed: RawEvent[];
    try {
      parsed = attempt.parse(result.body, { sourceUrl: attempt.url, today });
    } catch (err) {
      error = `extract(${attempt.kind}) failed: ${(err as Error).message}`;
      continue;
    }

    if (parsed.length > 0) {
      events = parsed;
      sourceKind = attempt.kind;
      sourceUrl = attempt.url;
      error = null;
      break;
    }
  }

  let eventsUpserted = 0;
  const snapshotId = snapshotIds.get(sourceUrl) ?? null;
  for (const raw of events) {
    const id = stableEventKey(adapter.venueId, raw.date, raw.title);
    const scraped: ScrapedEvent = {
      id,
      venueId: adapter.venueId,
      title: raw.title,
      startsAt: raw.startsAt,
      primaryArtist: null, // artist parsing is Feature 3
      ticketUrl: raw.ticketUrl,
      imageUrl: raw.imageUrl,
      description: raw.description,
    };
    await db.upsertEvent(scraped);
    const contributed = (["title", "startsAt", "ticketUrl", "imageUrl", "description"] as const).filter(
      (f) => isFilled(scraped[f]),
    );
    await db.setEventSource(id, adapter.venueId, snapshotId, sourceUrl, [...contributed]);
    eventsUpserted++;
  }

  const health = assessHealth(adapter, events, error);
  await db.recordRun({
    venueId: adapter.venueId,
    sourceUrl,
    sourceKind,
    startedAt,
    finishedAt: new Date().toISOString(),
    httpStatus,
    eventsFound: events.length,
    eventsUpserted,
    fieldsFilled: countFieldsFilled(events),
    health,
    error,
  });

  return {
    venueId: adapter.venueId,
    sourceKind,
    sourceUrl,
    httpStatus,
    eventsFound: events.length,
    eventsUpserted,
    health,
    error,
  };
}

/** Today's date as YYYY-MM-DD (caller may override for deterministic runs). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Run every adapter in sequence (polite: the fetcher rate-limits per host). */
export async function runIngest(
  db: EventfulDB,
  adapters: Adapter[],
  fetcher: Fetcher,
  today: string = todayIso(),
): Promise<AdapterRunResult[]> {
  const results: AdapterRunResult[] = [];
  for (const adapter of adapters) {
    results.push(await runAdapter(db, adapter, fetcher, today));
  }
  return results;
}
