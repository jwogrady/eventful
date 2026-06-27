/**
 * Cynthia Woods Mitchell Pavilion (woodlandscenter.org) — the first adapter.
 *
 * Demonstrates the ADR-0004 priority chain with two real extractors:
 *   1. the site's JSON data API (feed) — precise dates, ticket links, art;
 *   2. the public events listing HTML (fallback) — used only if the API fails.
 *
 * The API is the BubbleUp CMS's CloudFront data dump, not a documented public
 * API, so it can change without notice. That is exactly why the HTML fallback
 * exists: if the feed shape breaks, the adapter degrades to scraping rather
 * than dropping the venue, and the run's health flags the change.
 *
 * Both paths yield the same upcoming events. Extraction is unnormalized: dates
 * keep local wall-clock time and non-music listings pass through — Feature 3
 * classifies and normalizes.
 */
import { parse as parseHtml } from "node-html-parser";
import { titleKey } from "../key.ts";
import type { Adapter, ExtractContext, RawEvent } from "../types.ts";

const VENUE_ID = "cynthia-woods-mitchell-pavilion";
const ORIGIN = "https://www.woodlandscenter.org";
const API_URL = "https://d1f0qo0q94pye9.cloudfront.net/api/cwdata/all";
const EVENTS_URL = `${ORIGIN}/events`;

interface ApiEvent {
  at?: string | null;
  event_date?: string | null;
  ticket_url?: string | null;
}

interface ApiPage {
  path?: string | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  ogImage?: string | null;
  pagetype?: string | null;
  event?: ApiEvent | null;
}

/**
 * Drop duplicates that share an event identity, so a single source can't
 * inflate counts or silently overwrite. Keyed on the SAME (date, title)
 * identity as stableEventKey, so dedupe and the upsert key never disagree.
 */
function dedupe(events: RawEvent[]): RawEvent[] {
  const seen = new Set<string>();
  const out: RawEvent[] = [];
  for (const e of events) {
    const key = `${e.date}|${titleKey(e.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function absolute(href: string | null | undefined): string | null {
  if (!href) return null;
  return href.startsWith("http") ? href : ORIGIN + href;
}

/** Primary extractor: the official JSON API. Returns upcoming events only. */
export function parseWoodlandsApi(body: string, ctx: ExtractContext): RawEvent[] {
  const data = JSON.parse(body) as { pages?: ApiPage[] };
  const out: RawEvent[] = [];
  for (const page of data.pages ?? []) {
    if (page.pagetype !== "event" || !page.event?.event_date) continue;
    if (page.event.event_date < ctx.today) continue; // upcoming only
    const title = (page.title ?? page.name ?? "").trim();
    if (!title) continue;
    out.push({
      title,
      date: page.event.event_date,
      // `at` carries a tz offset (…-05:00); keep local wall time, drop the offset.
      startsAt: page.event.at ? page.event.at.slice(0, 19) : `${page.event.event_date}T00:00:00`,
      detailUrl: absolute(page.path),
      ticketUrl: page.event.ticket_url?.trim() || null,
      imageUrl: page.ogImage?.trim() || null,
      description: page.description?.trim() || null,
    });
  }
  return dedupe(out);
}

/** Fallback extractor: scrape the public events listing HTML. */
export function parseWoodlandsHtml(body: string, ctx: ExtractContext): RawEvent[] {
  const root = parseHtml(body);
  const out: RawEvent[] = [];
  for (const card of root.querySelectorAll("article.card-event")) {
    const time = card.querySelector("time");
    const heading = card.querySelector("h1");
    const link = card.querySelector("a.stretched-link");
    const image = card.querySelector("img");
    const subtitle = card.querySelector("p");

    const date = time?.getAttribute("datetime") ?? null;
    const title = heading ? heading.text.replace(time?.text ?? "", "").trim() : "";
    if (!title || !date || date < ctx.today) continue;

    out.push({
      title,
      date,
      startsAt: `${date}T00:00:00`,
      detailUrl: absolute(link?.getAttribute("href")),
      ticketUrl: null,
      imageUrl: image?.getAttribute("src")?.trim() || null,
      description: subtitle?.text.trim() || null,
    });
  }
  return dedupe(out);
}

export const woodlandsAdapter: Adapter = {
  venueId: VENUE_ID,
  attempts: [
    { kind: "feed", url: API_URL, parse: parseWoodlandsApi },
    { kind: "html", url: EVENTS_URL, parse: parseWoodlandsHtml },
  ],
  health: { minEvents: 3, requiredFields: ["title", "date"] },
};
