# 0004. Extraction via per-venue adapters, feeds-first

- Status: accepted
- Date: 2026-06-22
- Deciders: jwogrady

## Context and problem statement

The seed list has 10 heterogeneous sources: venue-owned sites (713musichall.com),
operator umbrellas (houstonfirsttheaters.com covers Jones Hall), and third-party
sites (mlb.com for Daikin Park). We need extraction that is reliable, polite to
the sources, maintainable per site, and — crucially — able to tell when a source
has broken so we can flag it rather than silently lose events.

## Decision drivers

- Trust over coverage: a broken source must be detectable per site.
- Respectful collection: prefer official feeds/APIs; rate-limit.
- Maintainability against sites that each look different.
- The venue list is hand-maintained, so per-site effort is acceptable.

## Considered options

- A single generic extractor (LLM/heuristic) run across every site.
- Per-venue adapters sharing a common interface, feeds-first.
- A paid third-party events aggregation API.

## Decision

Per-venue adapters implementing a common interface that returns a normalized raw
event shape. Each adapter tries structured sources in priority order before
falling back to fragile parsing:

1. Official API / iCal / RSS feed
2. `schema.org/Event` JSON-LD embedded in the page
3. Targeted HTML parsing as last resort

Each adapter declares health expectations (e.g. minimum expected events, required
fields) consumed by breakage detection (see
[0005](0005-ingestion-pipeline-and-breakage-detection.md)).

## Consequences

- Good: robust and debuggable per source, naturally polite (feeds first),
  per-source breakage is easy to detect and flag.
- Bad / cost: more code per venue and manual work to add a venue — acceptable
  given the curated list.
- Risks: third-party sources (mlb.com) may change without notice; the structured
  feed may not exist for every venue, forcing HTML parsing. A generic fallback
  extractor may be added later but is not the primary path.
