# Plan — Milestone 0.1.0: Houston live-music view

Decomposes [the problem statement](problem-statement.md) into four independently
shippable features — the thinnest end-to-end slice that proves the core promise:
*Houston live-music gigs show up on their own and I can browse them.* Stack and
architecture are recorded in [docs/adr/](adr/). Each feature maps to one GitHub
issue; each contribution ships as a `0.0.x` increment toward the `0.1.0`
milestone. Curation actions, the in-app review surface, and fuzzy cross-source
dedupe are deliberately deferred to `0.2.0` (see the end of this doc).

---

## Milestone: `0.1.0 — Houston live-music view`

**Outcome:** From the hand-maintained seed list of Houston venues, upcoming
live-music gigs appear in a self-updating web view the owner can browse, filter,
and search. Non-music listings are filtered out; per-source run metrics are
recorded so breakage is detectable. (Curation actions and the in-app review
surface arrive in `0.2.0`.)

---

## Feature 1 — Project foundation: app skeleton, data schema, seed venues

**Outcome:** A runnable Bun + Astro project with a DuckDB database whose schema
holds venues, raw snapshots, canonical events, provenance, and curation — seeded
with the 10 Houston venues. Everything downstream builds on this.

**Acceptance criteria**
- `bun install` then the documented dev command starts the Astro app locally.
- A DuckDB database is created from a versioned schema with tables for `venues`,
  `raw_snapshots`, `events`, `event_sources`, and curation (`shortlist`/`hidden`/
  `tags`/`notes`).
- All data access goes through a single thin data-access module (no scattered
  DB calls), per [ADR-0003](adr/0003-data-store-duckdb.md).
- The 10 seed venues (name, class, capacity, sector, primary sourcing site) are
  loaded into `venues`.
- Bun↔DuckDB bindings are proven working with a smoke test
  ([ADR-0001](adr/0001-runtime-bun-typescript.md) risk).

**Constraints:** Bun + TypeScript, Astro, DuckDB; single package to start.

---

## Feature 2 — Ingestion engine: per-venue adapters, pipeline, scheduling

**Outcome:** A scheduled job that fetches each venue source, extracts events via
per-venue adapters (feeds-first), stores raw snapshots, and idempotently upserts
results — so listings appear and refresh without manual entry.

**Acceptance criteria**
- A common adapter interface returns a normalized raw event shape; adapters try
  official feed/API → `schema.org` JSON-LD → targeted HTML, in that order
  ([ADR-0004](adr/0004-extraction-per-venue-adapters-feeds-first.md)).
- Adapters exist for the seed venues (feeds-first where available; HTML fallback
  where not), each declaring health expectations (min events, required fields).
- The pipeline runs `fetch → snapshot → extract → upsert` per source, stores a
  timestamped raw snapshot, and records per-source run metrics
  ([ADR-0005](adr/0005-ingestion-pipeline-and-breakage-detection.md)).
- Upserts are idempotent: re-running on the same input produces no duplicate rows
  and does not touch curation tables.
- The job runs on a recurring schedule via system cron on the self-hosted box;
  collection is rate-limited and polite.

**Constraints:** Prefer official feeds/APIs; rate-limit. Classify/normalize/
dedupe are Feature 3.

---

## Feature 3 — Canonicalize events: classify music, normalize

**Outcome:** Raw extracted events become clean canonical gigs — non-music
filtered out and messy date/price formats standardized. (Fuzzy cross-source
dedupe is deferred to `0.2.0`; for the seed list each venue is a distinct,
non-overlapping source, so exact-key upsert is sufficient for now.)

**Acceptance criteria**
- Music classification runs rules-first (source category, venue-class default,
  keyword signals); non-music events (sports, theater) are filtered from the view
  ([ADR-0006](adr/0006-music-classification.md)).
- Events below a confidence threshold are marked `uncertain` and excluded from
  the view (recorded for the deferred review surface, not auto-deleted).
- Each canonical event has a stable key (`venue + date + primary artist/title`)
  used for exact-match idempotent upsert; provenance is retained in
  `event_sources`
  ([ADR-0007](adr/0007-canonical-identity-and-curation-separation.md)).
- Dates/times normalize to a single representation; prices normalize to a
  structured form (min/max + currency, or "free"/"unknown").
- Re-running canonicalization is deterministic.

**Constraints:** Strictly live music. Trust over coverage — exclude uncertain,
don't guess. Fuzzy dedupe deferred to `0.2.0`.

---

## Feature 4 — Curated web view: browse, filter, search

**Outcome:** An Astro view that lists upcoming gigs and lets the owner filter and
search by date, venue, genre, and price — the everyday way to see what's on.

**Acceptance criteria**
- A listing page renders upcoming canonical gigs with their available fields
  (date/time, title, venue; plus ticket link, price, lineup, image, description
  when present).
- Filters for date range, venue, genre, and price narrow the list; a text search
  matches title/lineup/venue.
- Listing pages are server-rendered for fast first paint and shareability
  ([ADR-0002](adr/0002-web-view-astro.md)); interactivity is via islands.
- Non-music and `uncertain` events do not appear.

**Constraints:** Astro server rendering + islands; reads via the data-access layer.

---

## Deferred to `0.2.0`

These were in the original breakdown and remain planned — cut from `0.1.0` to get
a working end-to-end slice first. The `0.1.0` work leaves clean seams for them:
the schema already includes curation tables and provenance, and ingestion records
per-source run metrics.

- **Curation actions — shortlist, hide, tag, note.** Owner write-path via Astro
  endpoints, stored in separate tables keyed to the canonical event id so
  re-scrapes never clobber them
  ([ADR-0007](adr/0007-canonical-identity-and-curation-separation.md)).
- **Scrape health & review surface.** An in-app view of sources that look
  broken/incomplete plus `uncertain` events, with acknowledge/resolve. (`0.1.0`
  still records the metrics and logs breakage; this adds the UI and workflow.)
- **Fuzzy cross-source dedupe.** Merge near-duplicate gigs listed by more than
  one source, beyond the exact-key upsert shipped in `0.1.0`.

---

## Notes on sequencing

Features build roughly in order (1 → 2 → 3 → 4). Feature 4 (web view) can begin
against partially-canonicalized data once Feature 3 lands.
