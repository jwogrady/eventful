# Eventful — Problem Statement: Ticket Discovery (SEO + Affiliate)

*Status: Proposed — re-scopes the original live-music view
([problem-statement.md](problem-statement.md)). The re-scope, TM-as-primary-source,
and the live-proxy-plus-cache data flow are ratified as ADRs in `plan` before code.*

## Problem

When someone wants to go to a show, game, or concert, they search
"*{artist / team / venue} tickets*" and land on whoever ranks — often resale
middlemen, ad-choked aggregators, or sparse listings that don't answer the
intent. There is no fast, trustworthy, well-structured destination that covers
the full live-events catalog, answers the search immediately, and routes the
buyer to a legitimate checkout. Eventful today serves only a hand-maintained
Houston **music** list via per-venue scraping — it cannot capture the broad,
high-intent "tickets" search traffic that is the whole opportunity.

## Outcome

A self-updating, search-optimized ticket-discovery site backed by the
Ticketmaster Discovery API and monetized through Ticketmaster's affiliate /
partner program. For any event, artist, venue, category, or city in the
Discovery catalog there is a fast, server-rendered, richly structured page that
ranks in organic search, answers the buyer's intent on arrival, and links out to
a legitimate Ticketmaster checkout with affiliate attribution. A companion
developer **explorer** exercises every Discovery endpoint for building and
debugging that coverage. The API key never leaves the server; calls are
rate-limited and cached so crawler and repeat traffic don't burn quota.

## Success criteria

1. Consumer pages for events, venues, attractions, classifications, and
   locations are **server-rendered** with crawlable canonical URLs, emit valid
   `schema.org` `Event` / `BreadcrumbList` JSON-LD (eligible for Google rich
   results), and are covered by a sitemap and OG/meta tags.
2. Every outbound "buy / get tickets" link carries Ticketmaster **affiliate
   attribution**, and the path *organic landing → page → TM checkout* is
   measurable.
3. The `/explorer` surface can issue a request to **every** Discovery endpoint
   (events, venues, attractions, classifications, suggest) with form-driven
   params, shows the exact request URL, renders raw JSON, and paginates — all
   without exposing the API key.
4. All TM access goes through a **single server-side client**: key injected
   server-side, a shared limiter honoring 5 req/s + 5000/day, deep-paging capped
   at the 1000th item, and responses cached in DuckDB with a TTL.
5. Pages pass Core Web Vitals (fast first paint via SSR + islands) so they are
   competitive to rank.

## Prior art & reusable assets

- **Existing Eventful app** — Astro + Bun + DuckDB, a single data-access layer
  (`src/lib/db`), an ingestion pipeline with a per-venue adapter pattern, and a
  music-tuned canonical schema. The DB layer, app shell, and SSR approach carry
  over; the music-only / Houston scope and per-venue scrapers do **not** bind
  this product.
- **Ticketmaster Discovery API v2** — base
  `https://app.ticketmaster.com/discovery/v2/`, API key = Consumer Key in
  `.env`; the partner/affiliate program (business category *Technology
  Solution*) is the monetization channel.
- **The 10 seed venues** remain useful as launch/priority coverage but are no
  longer the catalog boundary.

## Constraints

- **Stack:** existing Bun + Astro (SSR + islands) + DuckDB. No new heavy
  services.
- **Key is server-only** — never shipped to the browser; all TM calls proxied
  through Astro server endpoints / SSR.
- **Respect TM limits:** 5 req/s, 5000/day, deep-paging ≤ 1000th item — enforced
  by a shared limiter plus DuckDB cache.
- **Partner-terms compliance:** attribution, permitted use of API content, and
  branding per the Ticketmaster affiliate/partner agreement.
- **SEO legitimacy:** pages must add genuine value over a raw API dump — Google
  penalizes thin affiliate pages, so this is a real risk the build must address,
  not assume away.

## Non-goals

- **No resale and no in-app checkout/payments** — we route to Ticketmaster; they
  transact.
- **No non-TM scraping** in this initiative — the existing per-venue adapters are
  out of scope here, not deleted.
- **No accounts/personalization** on day one (the music view's curation/shortlist
  features stay deferred).
- **Not limited to music or Houston** — though launch coverage may prioritize
  them.
