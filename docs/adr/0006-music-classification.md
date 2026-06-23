# 0006. Music classification: rules-first, flag the uncertain

- Status: accepted
- Date: 2026-06-22
- Deciders: jwogrady

## Context and problem statement

Scope is strictly live music, but several seed venues are multi-purpose: NRG
Stadium and Daikin Park host sports, Jones Hall and The Hobby Center host theater.
Their sites list non-music events we must filter out — without wrongly dropping a
real concert at the same venue.

## Decision drivers

- Strictly-live-music scope.
- Trust over coverage: flag uncertain cases rather than silently drop.
- Cheap and explainable; avoid an external API cost/dependency at the start.

## Considered options

- Rules/heuristics: source category/section, venue-class defaults, keyword signals.
- An LLM classifier for every event.
- A hybrid: rules first, LLM only for ambiguous cases.

## Decision

Rules-first classification. Use, in combination: the source-provided
category/section when present, venue-class defaults (a music-only hall is music
by default; a stadium is not), and keyword signals in the title/description. When
confidence is below a threshold, mark the event `uncertain` and flag it for
review rather than auto-dropping it. Keep a clean seam so an LLM classifier can
be added later for the ambiguous bucket.

## Consequences

- Good: cheap, deterministic, explainable, no external dependency to start;
  music-only venues are trivially correct.
- Bad / cost: rules need tuning and some misclassification is expected —
  mitigated by routing low-confidence cases to review.
- Risks: the hard cases are exactly the high-capacity multi-purpose venues; if
  rules prove too noisy there, escalate that bucket to the LLM path
  (hybrid option) without re-architecting.
