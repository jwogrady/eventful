# Eventful — Problem Statement

*Status: Authoritative — the problem this project solves.*

## Problem

Keeping up with live music means manually checking a dozen-plus venue websites,
each with its own layout, calendar widget, and posting rhythm. Listings live in
silos: there's no single place to see everything that's on, filter it the way
*you* think about gigs, or hold onto the ones you care about. Events get missed
simply because no one refreshes every site every day. Today this is a chore done
by hand; it should be a view that maintains itself.

## Outcome

A self-updating, personal web view of upcoming **live-music** gigs across the
Houston area, aggregated from a hand-maintained list of venue websites. It pulls
whatever event detail each site exposes, filters out non-music listings (e.g.
ball games at a stadium, plays at a theater), keeps itself current on a schedule,
and lets the owner browse, filter, shortlist, and annotate the results in one
place. When a venue's listings can't be read reliably, the system says so rather
than silently dropping events — trust in the data comes first. Built for one user
now, but structured so it could open to the public later without a rewrite.

## Success criteria

1. From a maintained list of music-venue sites, upcoming gigs appear in the view
   without manual data entry, and refresh on a recurring schedule.
2. Each event captures **whatever the source exposes** — at minimum
   date/time + title + venue, and where available: ticket link, price, lineup,
   image, and description.
3. Non-music listings from multi-purpose venues (sports, theater) are reliably
   filtered out, so the view shows only live music.
4. The same gig listed by more than one source is merged into a single entry,
   and messy date/price formats are normalized.
5. The owner can filter and search (by date, venue, genre, price), hand-pick or
   hide events into a personal shortlist, and add their own tags/notes.
6. When a venue's scrape looks broken or incomplete, it is **flagged for review**
   instead of failing silently or showing half-parsed events.

## Prior art & reusable assets

- The `eventful` repo is empty — no predecessor code or abandoned branch.
- **Seed venue list (Houston).** The owner supplied the initial hand-maintained
  set of 10 venues with capacities, sectors, and primary sourcing sites. This is
  the starting input, not an exhaustive list:

  | Venue | Class | Max capacity | Location sector | Primary sourcing site |
  |---|---|---|---|---|
  | NRG Stadium | Stadium | 72,000+ | South Loop | nrgpark.com |
  | Daikin Park | Stadium | 40,000+ | Downtown | mlb.com |
  | Toyota Center | Arena | 19,000 | Downtown | toyotacenter.com |
  | Cynthia Woods Mitchell Pavilion | Pavilion | 16,500 | The Woodlands | woodlandscenter.org |
  | Smart Financial Centre | Arena | 6,400 | Sugar Land | smartfinancialcentre.net |
  | 713 Music Hall | Music Hall | 5,000 | Downtown | 713musichall.com |
  | Bayou Music Center | Music Hall | 3,700 | Downtown | bayoumusiccenter.com |
  | White Oak Music Hall (The Lawn) | Pavilion / Lawn | 3,000 | Near Northside | whiteoakmusichall.com |
  | Jones Hall | Theater | 3,000 | Downtown | houstonfirsttheaters.com |
  | The Hobby Center | Theater | 2,650 | Downtown | thehobbycenter.org |

  Note: sites vary widely — some are venue-owned (713musichall.com), some are
  operator umbrellas (houstonfirsttheaters.com covers Jones Hall), and some are
  third-party (mlb.com for Daikin Park). Per-site extraction effort will differ.

## Constraints

- **Must-use stack (owner-specified):** Bun + Astro (components) with DuckDB as
  the data store. Final architecture is ratified in `plan`.
- **Self-hosted / cheap:** must run on the owner's own box or near-free hosting;
  avoid pricey managed services.
- **Respectful collection:** stay polite to source sites — rate-limit, and prefer
  official feeds/APIs where they exist.
- **Forward-compatible:** single-user today, but data model and architecture
  should not preclude a later public, multi-user version.

## Non-goals

- **No automatic venue discovery.** The venue list is hand-maintained, not
  crawled or inferred across a region.
- **Not multi-domain.** Scope is live music / gigs. Multi-purpose venues
  (stadiums, theaters) stay on the list as *sources*, but their non-music events
  (sports, plays) are filtered out — not shown. Schema/matching is tuned for music.
- **No ticketing or transactions.** The view links out to buy; it does not sell,
  reserve, or process payments.
- **Not a public product on day one.** No accounts, no public launch in scope yet
  — only the forward-compatible structure for it.
