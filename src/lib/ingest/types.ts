/**
 * Ingestion types (Feature 2).
 *
 * An adapter declares an ordered list of extraction attempts — official
 * feed/API → schema.org JSON-LD → targeted HTML (ADR-0004) — plus the health
 * expectations breakage detection checks against (ADR-0005). Extractors are
 * pure functions of a fetched body, so they can be tested on captured fixtures.
 */

/** A raw event as read from a source. Unnormalized — Feature 3 cleans it up. */
export interface RawEvent {
  title: string;
  /** Calendar date (YYYY-MM-DD); used to build the stable key. */
  date: string | null;
  /** Best-effort local start, as an ISO-ish string (no offset); null if unknown. */
  startsAt: string | null;
  detailUrl: string | null;
  ticketUrl: string | null;
  imageUrl: string | null;
  description: string | null;
}

/** Context handed to an extractor. `today` makes upcoming-only filtering deterministic. */
export interface ExtractContext {
  sourceUrl: string;
  today: string; // YYYY-MM-DD
}

export type SourceKind = "feed" | "jsonld" | "html";

/** One ordered attempt: fetch `url`, then run `parse` on the body. */
export interface Attempt {
  kind: SourceKind;
  url: string;
  parse: (body: string, ctx: ExtractContext) => RawEvent[];
}

/** Declared health expectations for breakage detection (ADR-0004/0005). */
export interface AdapterHealth {
  /** Below this many extracted events, the source is degraded. */
  minEvents: number;
  /** Fields every event must carry, else the source is degraded. */
  requiredFields: (keyof RawEvent)[];
}

/** A per-venue adapter: ordered attempts plus health expectations. */
export interface Adapter {
  venueId: string;
  attempts: Attempt[];
  health: AdapterHealth;
}
