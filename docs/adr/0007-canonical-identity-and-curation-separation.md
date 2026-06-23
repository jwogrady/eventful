# 0007. Canonical event identity and curation separation

- Status: accepted
- Date: 2026-06-22
- Deciders: jwogrady

## Context and problem statement

The same gig can appear from more than one source, and the view runs on a
schedule — so re-scrapes happen constantly. Two things must hold: duplicates
merge into one entry, and a re-scrape must never clobber the owner's curation
(shortlist, hidden, tags, notes). Both need a stable way to identify "the same
event" across runs and sources.

## Decision drivers

- Dedupe success criterion: one entry per real gig.
- Curation must survive every refresh.
- Provenance: know which source supplied which field.
- Public-later: identity scheme should not assume a single user.

## Considered options

- Use each source's own ID as the key (breaks across sources).
- Overwrite all event rows each run, store curation inline (loses curation).
- A computed canonical key + provenance table + separate curation tables.

## Decision

Compute a stable canonical event key from normalized `venue + date +
primary artist/title`, with fuzzy matching to merge near-duplicates. Provenance
lives in `event_sources` (which source contributed which fields). Curation state
lives in separate tables keyed to the canonical event id and is owner-only —
ingestion upserts scraped fields and never touches curation.

## Consequences

- Good: re-scrapes are safe, multi-source merges are explicit and auditable,
  curation persists across refreshes.
- Bad / cost: the canonical key and fuzzy matching need care — date+venue+artist
  collisions, festivals, and multi-night runs are tricky.
- Risks: mis-merges or mis-splits can mis-anchor curation; surface low-confidence
  merges via review (ties to [0005](0005-ingestion-pipeline-and-breakage-detection.md)).
