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
export const SCHEMA_VERSION = 1;

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
}
