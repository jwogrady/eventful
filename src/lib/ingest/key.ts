/**
 * Stable canonical event identity (ADR-0007).
 *
 * Feature 2 computes a deterministic key from venue + date + title so that
 * re-scrapes upsert in place instead of duplicating. Feature 3 refines identity
 * with normalization and fuzzy cross-source merging; this is the exact-match
 * key both rely on.
 */

/** Lowercase, hyphenated, ASCII-folded slug of arbitrary text. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable djb2 token in base36 — a fallback identity for titles that slugify empty. */
function titleToken(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * The canonical title part of an event's identity: its slug, or a deterministic
 * token when the title has no sluggable characters (e.g. "!!!", emoji, CJK).
 * Both the stable key and adapter dedupe use this so they never disagree.
 */
export function titleKey(title: string): string {
  return slugify(title) || titleToken(title);
}

/** Deterministic event key: `venueId:date:title` (ADR-0007). */
export function stableEventKey(venueId: string, date: string | null, title: string): string {
  return `${venueId}:${date ?? "nodate"}:${titleKey(title)}`;
}
