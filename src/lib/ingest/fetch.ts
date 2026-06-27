/**
 * Polite HTTP fetching for ingestion (ADR-0004/0005).
 *
 * A descriptive User-Agent, a request timeout, and a minimum delay between
 * requests to the same host (rate-limiting). The pipeline depends on the
 * `Fetcher` type, not this implementation, so tests inject a fixture fetcher
 * and never touch the network.
 */

export interface FetchResult {
  url: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  body: string;
}

export type Fetcher = (url: string) => Promise<FetchResult>;

const USER_AGENT = "EventfulBot/0.1 (+https://github.com/jwogrady/eventful)";

export interface FetcherOptions {
  /** Minimum gap between requests to the same host. Default 1000ms. */
  minHostIntervalMs?: number;
  /** Per-request timeout. Default 20000ms. */
  timeoutMs?: number;
  /** Maximum response body to read; larger responses error out. Default 16 MiB. */
  maxBytes?: number;
}

/** Read a response body, aborting if it exceeds `maxBytes` (guards against a
 *  runaway or hostile source exhausting memory and bloating raw_snapshots). */
async function readCappedBody(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`response body exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Build a rate-limited, timeout-bounded fetcher with a descriptive UA. */
export function createFetcher(opts: FetcherOptions = {}): Fetcher {
  const minInterval = opts.minHostIntervalMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxBytes = opts.maxBytes ?? 16 * 1024 * 1024;
  const lastByHost = new Map<string, number>();

  return async (url: string): Promise<FetchResult> => {
    const host = new URL(url).host;
    const waitMs = Math.max(0, (lastByHost.get(host) ?? 0) + minInterval - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastByHost.set(host, Date.now() + waitMs);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/json, text/html;q=0.9, */*;q=0.5" },
        redirect: "follow",
        signal: controller.signal,
      });
      const body = await readCappedBody(res, maxBytes);
      return {
        url,
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get("content-type"),
        body,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
