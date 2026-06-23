# 0005. Ingestion pipeline and breakage detection

- Status: accepted
- Date: 2026-06-22
- Deciders: jwogrady

## Context and problem statement

The view must keep itself current on a schedule and must never silently drop a
venue whose listings stopped parsing. We need a repeatable pipeline that turns
sources into canonical gigs and produces an explicit health signal per source.

## Decision drivers

- Recurring auto-refresh without manual data entry.
- Flag-for-review failure mode (trust over coverage).
- Reproducible and debuggable — we can re-run on captured input.
- Self-hosted / cheap — no managed scheduler dependency.

## Considered options

- One-shot script that overwrites the DB each run.
- A staged pipeline with raw snapshots, idempotent upserts, and health metrics.
- An external managed workflow/scheduler service.

## Decision

A scheduled Bun job runs a staged pipeline per source:

`fetch → store raw snapshot (timestamped) → extract (adapter) → classify →
normalize → dedupe → idempotent upsert into canonical tables`

Each run records per-source metrics (events found, fields filled, errors).
Breakage detection compares metrics against the adapter's declared expectations
and recent runs (e.g. a sudden drop to zero, missing required fields) and writes
a per-source health status. Scheduling is system cron invoking the Bun script on
the self-hosted box — no external scheduler. Raw snapshots are retained (with a
retention window) so extraction can be re-run without re-fetching.

## Consequences

- Good: reproducible, debuggable from snapshots, and breakage is explicit and
  surfaced to the owner (see the review-flagging feature).
- Bad / cost: snapshot storage grows — bounded by a retention policy.
- Risks: pipeline writes must serialize against web curation writes
  (see [0003](0003-data-store-duckdb.md)); classify/normalize/dedupe are their
  own decisions (see [0006](0006-music-classification.md),
  [0007](0007-canonical-identity-and-curation-separation.md)).
