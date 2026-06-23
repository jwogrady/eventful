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

## Scope

In: live-music gigs from a curated set of Houston venues, refreshed on a
schedule. Out (for now): venue auto-discovery, non-music events, ticketing, and
public multi-user accounts. See the [problem statement](docs/problem-statement.md)
for the full non-goals.
