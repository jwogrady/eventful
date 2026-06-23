# 0002. Web view: Astro

- Status: accepted
- Date: 2026-06-22
- Deciders: jwogrady

## Context and problem statement

The curated view is read-heavy — listings of upcoming gigs the owner browses,
filters, and searches — with a smaller set of interactive write actions
(shortlist, hide, tag, note). It should be cheap to host and, since the project
may go public later, friendly to SEO and fast first paint.

## Decision drivers

- Owner-specified must-use framework: Astro.
- Content-first, server-rendered listings with minimal client JS.
- Public-later: good SEO and shareable pages.
- Needs a small write path for curation actions.

## Considered options

- Astro (server-rendered pages + islands)
- SvelteKit
- Next.js

## Decision

Astro with server rendering for listing/detail pages. Interactivity (filter,
search, curation actions) is handled by small islands or inline client scripts
that call Astro server endpoints. Curation writes go through Astro endpoints to
the data layer rather than direct client-to-DB access.

## Consequences

- Good: excellent for content/SEO, ships little JS, fits the public-later goal,
  cheap to host.
- Bad / cost: Astro is content-oriented, so the interactive curation layer needs
  explicit server endpoints and a little client wiring — more deliberate than a
  full app framework would require.
- Risks: the write path (endpoints → DuckDB) must serialize against the
  ingestion pipeline's writes (see [0003](0003-data-store-duckdb.md)).
