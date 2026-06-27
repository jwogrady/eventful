# Eventful

A self-updating, personal web view of upcoming **live-music** gigs across the
Houston area. Eventful scrapes a hand-maintained list of venue websites, filters
out non-music listings, and presents what's on in one place you can browse,
filter, and search — instead of checking a dozen venue sites by hand.

Built for one user now, structured so it could open to the public later.

## Status

Early. The problem is framed and the first milestone is planned; implementation
is just beginning.

- [Problem statement](docs/problem-statement.md) — what this solves and why.
- [Plan — milestone 0.1.0](docs/plan-0.1.0.md) — the feature breakdown.
- [Architecture decisions](docs/adr/) — stack and design choices (ADRs).

## Stack

Bun + TypeScript · Astro (web view) · DuckDB (embedded data store). Self-hosted
and cheap to run. See the [ADRs](docs/adr/) for the reasoning.

## Develop

Requires [Bun](https://bun.sh) (the runtime, package manager, and test runner —
see [ADR-0001](docs/adr/0001-runtime-bun-typescript.md)).

```bash
bun install        # install dependencies
bun run dev        # start the Astro app at http://localhost:4321
bun run build      # build the static site
bun test           # run the test suite
```

### Database

The data store is an embedded DuckDB file
([ADR-0003](docs/adr/0003-data-store-duckdb.md)); all access goes through the
single data-access module at `src/lib/db/`. The schema lives in `db/schema.sql`
and the seed venues in `db/seeds/venues.json`. The database is written to
`data/eventful.duckdb` (gitignored); override with `EVENTFUL_DB_PATH`.

```bash
bun run db:init    # create the database from the versioned schema (idempotent)
bun run db:seed    # load the 10 Houston seed venues (idempotent)
bun run db:smoke   # prove the Bun↔DuckDB binding end to end (in-memory)
```

### Ingestion

A per-venue adapter pipeline fetches each source, stores a timestamped raw
snapshot, extracts events (official feed/API → JSON-LD → HTML, in that order),
and idempotently upserts them — never touching curation
([ADR-0004](docs/adr/0004-extraction-per-venue-adapters-feeds-first.md),
[ADR-0005](docs/adr/0005-ingestion-pipeline-and-breakage-detection.md)).
Adapters live in `src/lib/ingest/adapters/`; The Woodlands (Cynthia Woods
Mitchell Pavilion) is the first.

```bash
bun run ingest     # run every adapter once; ensures schema + seed venues first
```

Each run records per-source metrics and a health verdict (`ok` / `degraded` /
`broken`) in `ingest_runs`; the command exits non-zero if any source is broken,
so a scheduler can detect breakage. Run it on a schedule with system cron
([ADR-0005](docs/adr/0005-ingestion-pipeline-and-breakage-detection.md)) — e.g.
hourly, logging output for review:

```cron
# Eventful ingestion — hourly (adjust the repo path and Bun location)
0 * * * * cd /path/to/eventful && /home/you/.bun/bin/bun run ingest >> data/ingest.log 2>&1
```

## Scope

In: live-music gigs from a curated set of Houston venues, refreshed on a
schedule. Out (for now): venue auto-discovery, non-music events, ticketing, and
public multi-user accounts. See the [problem statement](docs/problem-statement.md)
for the full non-goals.
