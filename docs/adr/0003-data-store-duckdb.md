# 0003. Data store: DuckDB

- Status: accepted
- Date: 2026-06-22
- Deciders: jwogrady

## Context and problem statement

Eventful stores venues, raw extractions, the canonical de-duplicated events, and
the owner's curation state. The dominant read pattern is analytical filtering —
slice gigs by date, venue, genre, and price. Data volume is modest (tens of
venues, thousands of events). The store must be cheap to self-host.

## Decision drivers

- Owner-specified must-use store: DuckDB.
- Embedded / file-based — zero ops, near-free hosting.
- Strong analytical SQL for the filter/search view.
- Single-user today; public/multi-user is a later possibility.

## Considered options

- DuckDB (embedded, columnar, analytical)
- SQLite (embedded, row-oriented)
- Postgres (server, multi-writer)

## Decision

A single embedded DuckDB database file is the system of record. Planned tables:
`venues`, `raw_snapshots` (timestamped per-source captures), `events` (canonical),
`event_sources` (provenance — which source contributed which fields), and
curation tables (`shortlist`/`hidden`/`tags`/`notes`). All data access goes
through one thin data-access layer so the store can be swapped later.

## Consequences

- Good: zero-ops, fast columnar analytical queries, file-based and trivially
  self-hosted, great fit for the filter-heavy view.
- Bad / cost: DuckDB is single-writer. The ingestion pipeline and the web
  curation writes must be serialized (e.g. pipeline writes to a side file then
  swaps, or a single write path/queue). This is acceptable for one user.
- Risks: a public, concurrent, multi-writer future likely needs migration to a
  server DB (Postgres). Mitigation: isolate all access behind the data-access
  layer now so the swap is contained. Also validate Bun↔DuckDB bindings early
  (see [0001](0001-runtime-bun-typescript.md)).
