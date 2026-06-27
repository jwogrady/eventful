/**
 * Eventful data-access layer.
 *
 * The single place any code touches DuckDB. Per ADR-0003, all reads and writes
 * go through this module so the store stays swappable and writes can be
 * serialized later. Per ADR-0001, it also isolates the Bun↔DuckDB binding: if
 * the binding ever breaks, only this file changes (e.g. to run under Node).
 */
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Bump this whenever db/schema.sql changes; recorded in the schema_meta table. */
export const SCHEMA_VERSION = 2;

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCHEMA_PATH = resolve(PROJECT_ROOT, "db/schema.sql");
const SEEDS_PATH = resolve(PROJECT_ROOT, "db/seeds/venues.json");

/** Default on-disk database file (data/ is gitignored). Override with EVENTFUL_DB_PATH. */
export function defaultDbPath(): string {
  return process.env.EVENTFUL_DB_PATH ?? resolve(PROJECT_ROOT, "data/eventful.duckdb");
}

/** A canonical venue row. */
export interface Venue {
  id: string;
  name: string;
  venueClass: string;
  capacity: number | null;
  capacityDisplay: string;
  locationSector: string;
  sourcingSite: string;
}

/** Read the hand-maintained seed venues from db/seeds/venues.json. */
export function loadSeedVenues(): Venue[] {
  return JSON.parse(readFileSync(SEEDS_PATH, "utf8")) as Venue[];
}

/**
 * A scraped event ready to upsert into `events`. Holds only what an adapter can
 * read from a source; classification/confidence and price/date normalization
 * stay unset until Feature 3, and curation is never written here.
 */
export interface ScrapedEvent {
  id: string; // stable canonical key (venue + date + title), see ADR-0007
  venueId: string;
  title: string;
  startsAt: string | null; // ISO date/timestamp string, or null if unknown
  primaryArtist: string | null;
  ticketUrl: string | null;
  imageUrl: string | null;
  description: string | null;
}

/** A timestamped raw capture, stored before extraction (ADR-0005). */
export interface SnapshotInput {
  venueId: string;
  sourceUrl: string;
  httpStatus: number | null;
  contentType: string | null;
  contentHash: string | null;
  body: string | null;
  ok: boolean | null;
  note?: string | null;
}

export type Health = "ok" | "degraded" | "broken";

/** Per-source metrics and health verdict for one pipeline run (ADR-0005). */
export interface IngestRunInput {
  venueId: string;
  sourceUrl: string;
  sourceKind: string | null; // winning extractor: feed | jsonld | html
  startedAt: string; // ISO
  finishedAt: string | null; // ISO
  httpStatus: number | null;
  eventsFound: number;
  eventsUpserted: number;
  fieldsFilled: Record<string, number> | null;
  health: Health;
  error: string | null;
  note?: string | null;
}

/** A summary row from `ingest_runs` (subset used by callers/tests). */
export interface IngestRunRow {
  venueId: string;
  sourceKind: string | null;
  httpStatus: number | null;
  eventsFound: number;
  eventsUpserted: number;
  health: Health;
  error: string | null;
}

/**
 * Thin handle around a DuckDB connection. Construct with `EventfulDB.open()`.
 * Methods are intentionally narrow — extend here rather than reaching into the
 * connection from elsewhere.
 */
export class EventfulDB {
  private constructor(
    private readonly instance: DuckDBInstance,
    private readonly connection: DuckDBConnection,
    readonly path: string,
  ) {}

  /** Open (creating parent dirs for a file path) and connect. Use ":memory:" for ephemeral. */
  static async open(dbPath: string = defaultDbPath()): Promise<EventfulDB> {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    const instance = await DuckDBInstance.create(dbPath);
    try {
      const connection = await instance.connect();
      return new EventfulDB(instance, connection, dbPath);
    } catch (err) {
      instance.closeSync();
      throw err;
    }
  }

  /** Release the connection and instance. */
  close(): void {
    this.connection.disconnectSync();
    this.instance.closeSync();
  }

  /** Run a query and return its rows as plain objects. */
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const reader = await this.connection.runAndReadAll(sql, params);
    return reader.getRowObjects() as T[];
  }

  /**
   * Create every table from the versioned schema and record SCHEMA_VERSION.
   * Idempotent: safe to run against an existing database.
   */
  async initSchema(): Promise<void> {
    await this.connection.run(readFileSync(SCHEMA_PATH, "utf8"));
    await this.connection.run(
      `INSERT INTO schema_meta (key, value) VALUES ('schema_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [String(SCHEMA_VERSION)],
    );
  }

  /** The schema version recorded in the database, or null if uninitialized. */
  async schemaVersion(): Promise<number | null> {
    const rows = await this.query<{ value: string }>(
      "SELECT value FROM schema_meta WHERE key = 'schema_version'",
    );
    return rows.length ? Number(rows[0].value) : null;
  }

  /**
   * Upsert the given venues by id. Idempotent — re-running with the same seed
   * data produces no duplicate rows and leaves the count unchanged.
   */
  async upsertVenues(venues: Venue[]): Promise<void> {
    for (const v of venues) {
      await this.connection.run(
        `INSERT INTO venues
           (id, name, venue_class, capacity, capacity_display, location_sector, sourcing_site)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name,
           venue_class = excluded.venue_class,
           capacity = excluded.capacity,
           capacity_display = excluded.capacity_display,
           location_sector = excluded.location_sector,
           sourcing_site = excluded.sourcing_site`,
        [v.id, v.name, v.venueClass, v.capacity, v.capacityDisplay, v.locationSector, v.sourcingSite],
      );
    }
  }

  /** Number of venues currently stored. */
  async countVenues(): Promise<number> {
    const rows = await this.query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM venues");
    return rows[0]?.n ?? 0;
  }

  /** All venues, ordered by capacity (largest first). */
  async listVenues(): Promise<Venue[]> {
    return this.query<Venue>(
      `SELECT id,
              name,
              venue_class      AS "venueClass",
              capacity,
              capacity_display AS "capacityDisplay",
              location_sector  AS "locationSector",
              sourcing_site    AS "sourcingSite"
         FROM venues
        ORDER BY capacity DESC NULLS LAST, name`,
    );
  }

  // ── Ingestion (Feature 2) ──────────────────────────────────────────────
  // Writes scraped data only. Never touches the curation tables; classification
  // and price/date normalization are left for Feature 3.

  /** Store a timestamped raw capture; returns its snapshot id. Append-only. */
  async insertSnapshot(s: SnapshotInput): Promise<number> {
    const rows = await this.query<{ id: bigint }>(
      `INSERT INTO raw_snapshots
         (venue_id, source_url, http_status, content_type, content_hash, body, ok, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [s.venueId, s.sourceUrl, s.httpStatus, s.contentType, s.contentHash, s.body, s.ok, s.note ?? null],
    );
    return Number(rows[0].id);
  }

  /**
   * Upsert one scraped event by its stable id. Writes only scraped fields and
   * bumps last_seen_at; leaves classification/confidence (Feature 3) and all
   * curation untouched. Idempotent — re-running the same input changes nothing.
   */
  async upsertEvent(e: ScrapedEvent): Promise<void> {
    // venue_id is deliberately NOT in the DO UPDATE set: it is immutable for a
    // given event id (the stable key embeds the venue), and DuckDB refuses to
    // update a foreign-key column on a row that other tables reference — which
    // every re-scrape would otherwise hit.
    await this.connection.run(
      `INSERT INTO events
         (id, venue_id, title, primary_artist, starts_at, ticket_url, image_url, description)
       VALUES ($1, $2, $3, $4, $5::TIMESTAMP, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         title = excluded.title,
         primary_artist = excluded.primary_artist,
         starts_at = excluded.starts_at,
         ticket_url = excluded.ticket_url,
         image_url = excluded.image_url,
         description = excluded.description,
         last_seen_at = now()`,
      [e.id, e.venueId, e.title, e.primaryArtist, e.startsAt, e.ticketUrl, e.imageUrl, e.description],
    );
  }

  /**
   * Replace provenance for one (event, source) pair. Idempotent per source:
   * re-running deletes the prior row and writes a fresh one, never duplicating.
   */
  async setEventSource(
    eventId: string,
    venueId: string,
    snapshotId: number | null,
    sourceUrl: string,
    contributedFields: string[],
  ): Promise<void> {
    await this.connection.run(
      `DELETE FROM event_sources WHERE event_id = $1 AND source_url = $2`,
      [eventId, sourceUrl],
    );
    await this.connection.run(
      `INSERT INTO event_sources (event_id, venue_id, snapshot_id, source_url, contributed_fields)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventId, venueId, snapshotId, sourceUrl, JSON.stringify(contributedFields)],
    );
  }

  /** Record one source's run metrics and health verdict; returns the run id. */
  async recordRun(r: IngestRunInput): Promise<number> {
    const rows = await this.query<{ id: bigint }>(
      `INSERT INTO ingest_runs
         (venue_id, source_url, source_kind, started_at, finished_at, http_status,
          events_found, events_upserted, fields_filled, health, error, note)
       VALUES ($1, $2, $3, $4::TIMESTAMP, $5::TIMESTAMP, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        r.venueId, r.sourceUrl, r.sourceKind, r.startedAt, r.finishedAt, r.httpStatus,
        r.eventsFound, r.eventsUpserted,
        r.fieldsFilled ? JSON.stringify(r.fieldsFilled) : null,
        r.health, r.error, r.note ?? null,
      ],
    );
    return Number(rows[0].id);
  }

  /** Count events, optionally scoped to one venue. */
  async countEvents(venueId?: string): Promise<number> {
    const rows = venueId
      ? await this.query<{ n: number }>(
          "SELECT count(*)::INTEGER AS n FROM events WHERE venue_id = $1",
          [venueId],
        )
      : await this.query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM events");
    return rows[0]?.n ?? 0;
  }

  /** Count raw snapshots, optionally scoped to one venue. */
  async countSnapshots(venueId?: string): Promise<number> {
    const rows = venueId
      ? await this.query<{ n: number }>(
          "SELECT count(*)::INTEGER AS n FROM raw_snapshots WHERE venue_id = $1",
          [venueId],
        )
      : await this.query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM raw_snapshots");
    return rows[0]?.n ?? 0;
  }

  /** The most recent ingest run for a venue, or null if it has never run. */
  async latestRun(venueId: string): Promise<IngestRunRow | null> {
    const rows = await this.query<IngestRunRow>(
      `SELECT venue_id        AS "venueId",
              source_kind     AS "sourceKind",
              http_status     AS "httpStatus",
              events_found    AS "eventsFound",
              events_upserted AS "eventsUpserted",
              health,
              error
         FROM ingest_runs
        WHERE venue_id = $1
        ORDER BY started_at DESC, id DESC
        LIMIT 1`,
      [venueId],
    );
    return rows[0] ?? null;
  }
}
