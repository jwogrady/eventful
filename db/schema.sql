-- Eventful canonical schema (DuckDB)
-- Versioned: bump SCHEMA_VERSION in src/lib/db/index.ts when this file changes.
-- Idempotent: every object uses IF NOT EXISTS so db:init can run repeatedly.
--
-- Layout mirrors plan-0.1.0.md / ADR-0003:
--   venues                 -- hand-maintained seed venues (Feature 1)
--   raw_snapshots          -- timestamped per-source captures (Feature 2)
--   events                 -- canonical, de-duplicated gigs (Feature 3)
--   event_sources          -- provenance: which source fed which event/fields
--   shortlist/hidden/tags/notes -- owner curation, kept SEPARATE from canonical
--                                  event data so re-scrapes never clobber it.

-- Sequences for surrogate keys (canonical event ids are stable text keys set
-- in Feature 3; these back the rows ingestion/curation create on its behalf).
CREATE SEQUENCE IF NOT EXISTS seq_raw_snapshots START 1;
CREATE SEQUENCE IF NOT EXISTS seq_event_sources START 1;
CREATE SEQUENCE IF NOT EXISTS seq_tags START 1;
CREATE SEQUENCE IF NOT EXISTS seq_notes START 1;
CREATE SEQUENCE IF NOT EXISTS seq_ingest_runs START 1;

-- Schema metadata (records the applied schema version).
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── Canonical data ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venues (
  id               TEXT PRIMARY KEY,            -- stable slug, e.g. 'nrg-stadium'
  name             TEXT NOT NULL,
  venue_class      TEXT NOT NULL,               -- Stadium | Arena | Pavilion | ...
  capacity         INTEGER,                     -- numeric max capacity
  capacity_display TEXT NOT NULL,               -- original string, e.g. '72,000+'
  location_sector  TEXT NOT NULL,               -- e.g. 'Downtown', 'The Woodlands'
  sourcing_site    TEXT NOT NULL,               -- primary site events are sourced from
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_snapshots (
  id           BIGINT PRIMARY KEY DEFAULT nextval('seq_raw_snapshots'),
  venue_id     TEXT NOT NULL REFERENCES venues(id),
  source_url   TEXT NOT NULL,
  fetched_at   TIMESTAMP NOT NULL DEFAULT now(),
  http_status  INTEGER,
  content_type TEXT,
  content_hash TEXT,                            -- hash of body, to skip unchanged captures
  body         TEXT,
  ok           BOOLEAN,                          -- did the fetch/parse look healthy
  note         TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,              -- stable key: venue + date + primary artist/title
  venue_id       TEXT NOT NULL REFERENCES venues(id),
  title          TEXT NOT NULL,
  primary_artist TEXT,
  starts_at      TIMESTAMP,
  doors_at       TIMESTAMP,
  ends_at        TIMESTAMP,
  price_kind     TEXT,                          -- free | range | unknown
  price_min      DECIMAL(10, 2),
  price_max      DECIMAL(10, 2),
  price_currency TEXT,
  ticket_url     TEXT,
  image_url      TEXT,
  description    TEXT,
  classification TEXT,                          -- music | non_music | uncertain
  confidence     DOUBLE,
  first_seen_at  TIMESTAMP NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMP NOT NULL DEFAULT now()
);

-- Provenance: which source contributed which fields to a canonical event.
CREATE TABLE IF NOT EXISTS event_sources (
  id                 BIGINT PRIMARY KEY DEFAULT nextval('seq_event_sources'),
  event_id           TEXT NOT NULL REFERENCES events(id),
  venue_id           TEXT NOT NULL REFERENCES venues(id),
  snapshot_id        BIGINT REFERENCES raw_snapshots(id),
  source_url         TEXT NOT NULL,
  contributed_fields TEXT,                      -- JSON array of field names
  extracted_at       TIMESTAMP NOT NULL DEFAULT now()
);

-- ── Curation (owner state) ──────────────────────────────────────────────────
-- Kept physically separate from canonical event data and keyed by event id, so
-- ingestion re-scrapes can rewrite events/* without ever touching owner state.

CREATE TABLE IF NOT EXISTS shortlist (
  event_id   TEXT PRIMARY KEY REFERENCES events(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hidden (
  event_id   TEXT PRIMARY KEY REFERENCES events(id),
  reason     TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id         BIGINT PRIMARY KEY DEFAULT nextval('seq_tags'),
  event_id   TEXT NOT NULL REFERENCES events(id),
  tag        TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (event_id, tag)
);

CREATE TABLE IF NOT EXISTS notes (
  id         BIGINT PRIMARY KEY DEFAULT nextval('seq_notes'),
  event_id   TEXT NOT NULL REFERENCES events(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- ── Ingestion telemetry ─────────────────────────────────────────────────────
-- One row per source per pipeline run (ADR-0005): the metrics and the health
-- verdict. The latest row for a venue is its current health; the 0.2.0 review
-- surface reads this. Append-only — runs accumulate as history.

CREATE TABLE IF NOT EXISTS ingest_runs (
  id              BIGINT PRIMARY KEY DEFAULT nextval('seq_ingest_runs'),
  venue_id        TEXT NOT NULL REFERENCES venues(id),
  source_url      TEXT NOT NULL,
  source_kind     TEXT,                            -- winning extractor: feed | jsonld | html
  started_at      TIMESTAMP NOT NULL DEFAULT now(),
  finished_at     TIMESTAMP,
  http_status     INTEGER,
  events_found    INTEGER NOT NULL DEFAULT 0,
  events_upserted INTEGER NOT NULL DEFAULT 0,
  fields_filled   TEXT,                            -- JSON: per-field fill counts
  health          TEXT NOT NULL,                   -- ok | degraded | broken
  error           TEXT,
  note            TEXT
);
