export interface BunkerPrice {
  port: string;
  vlsfo: number;
  mgo?: number;
  fetched_at: string;
}

const BUNKER_URL = 'https://shipandbunker.com/prices';

/**
 * Parse Ship&Bunker HTML table — regex-based (no cheerio dependency required).
 * Handles the recorded fixture format and live page variations.
 */
export function parseBunkerHtml(html: string): Map<string, BunkerPrice> {
  const result = new Map<string, BunkerPrice>();
  const now = new Date().toISOString();

  // Match <tr class="port-row"> blocks
  const rowPattern = /<tr[^>]*class="[^"]*port-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    const portMatch = /<td[^>]*class="[^"]*port-name[^"]*"[^>]*>\s*([^<]+)\s*<\/td>/i.exec(rowHtml);
    const vlsfoMatch = /<td[^>]*class="[^"]*vlsfo[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(rowHtml);

    if (!portMatch || !vlsfoMatch) continue;

    const port = portMatch[1].trim();
    // Strip nested HTML tags, normalize EU locale comma-decimal, then parse
    const vlsfoRaw = vlsfoMatch[1].replace(/<[^>]+>/g, '').trim().replace(/,(\d{2})$/, '.$1').replace(/[.,](?=\d{3})/g, '');
    const vlsfo = parseFloat(vlsfoRaw);
    if (!port || isNaN(vlsfo)) continue;

    const mgoMatch = /<td[^>]*class="[^"]*mgo[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(rowHtml);
    const mgoRaw = mgoMatch ? mgoMatch[1].replace(/<[^>]+>/g, '').trim().replace(/,(\d{2})$/, '.$1').replace(/[.,](?=\d{3})/g, '') : null;
    const mgo = mgoRaw ? parseFloat(mgoRaw) : undefined;

    result.set(port, { port, vlsfo, mgo, fetched_at: now });
  }

  return result;
}

export async function fetchBunkerPrices(ports?: string[]): Promise<Map<string, BunkerPrice>> {
  try {
    const res = await fetch(BUNKER_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuantikaBot/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const all = parseBunkerHtml(html);

    if (ports && ports.length > 0) {
      const filtered = new Map<string, BunkerPrice>();
      for (const p of ports) {
        const entry = all.get(p);
        if (entry) filtered.set(p, entry);
      }
      return filtered;
    }

    return all;
  } catch (err) {
    console.warn('[bunker] Scrape failed, returning empty map:', (err as Error).message);
    return new Map();
  }
}
