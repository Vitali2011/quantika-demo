// DEMO: interim HTML scrape of bunkerindex.com for demonstration purposes.
// Production deployment requires a licensed API or official data source.
import type Database from 'better-sqlite3';
import { upsertBunkerPrice, getLatestBunkerPrice } from '@/lib/market/bunker-repository';

const BUNKERINDEX_URL = 'https://www.bunkerindex.com/';

// Ports to scrape — Houston and Gibraltar intentionally excluded (no free source)
const TARGET_PORTS: ReadonlyMap<string, string> = new Map([
  ['Rotterdam', 'NLRTM'],
  ['Singapore', 'SGSIN'],
  ['Fujairah', 'AEFJR'],
]);

const RANGE_VLSFO = { min: 300, max: 1500 } as const;
const RANGE_MGO = { min: 400, max: 2000 } as const;

export class BunkerIndexParseError extends Error {
  constructor(msg: string) { super(msg); this.name = 'BunkerIndexParseError'; }
}

export interface BunkerIndexEntry {
  portName: string;
  unlocode: string;
  vlsfo?: number;
  mgo?: number;
}

export type HtmlFetcher = (url: string) => Promise<string>;

/**
 * Parse VLSFO and MGO prices for target ports from bunkerindex.com HTML.
 * Only returns rows for TARGET_PORTS (Rotterdam/Singapore/Fujairah).
 * Houston and Gibraltar are intentionally not parsed.
 */
export function parseBunkerIndexHtml(html: string): BunkerIndexEntry[] {
  // Detect structurally broken HTML
  if (!html.includes('price-table') && !html.includes('bunkerPriceTable') && !html.includes('data-grade')) {
    throw new BunkerIndexParseError(
      'HTML contains no price table — bunkerindex.com page structure may have changed',
    );
  }

  const results: BunkerIndexEntry[] = [];

  // Extract price rows: <tr data-port="..." data-unlocode="...">
  const rowPattern = /<tr[^>]*data-port="([^"]+)"[^>]*data-unlocode="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const portName = rowMatch[1].trim();
    const unlocode = rowMatch[2].trim();
    const rowHtml = rowMatch[3];

    // Only process target ports
    if (!TARGET_PORTS.has(portName)) continue;

    // Extract VLSFO price: data-grade="VLSFO">price<
    const vlsfoMatch = rowHtml.match(/data-grade="VLSFO"[^>]*>([\d.]+)/);
    // Extract MGO price: data-grade="MGO">price<
    const mgoMatch = rowHtml.match(/data-grade="MGO"[^>]*>([\d.]+)/);

    const entry: BunkerIndexEntry = { portName, unlocode };
    if (vlsfoMatch) {
      const v = parseFloat(vlsfoMatch[1]);
      if (Number.isFinite(v)) entry.vlsfo = v;
    }
    if (mgoMatch) {
      const v = parseFloat(mgoMatch[1]);
      if (Number.isFinite(v)) entry.mgo = v;
    }

    if (entry.vlsfo !== undefined || entry.mgo !== undefined) {
      results.push(entry);
    }
  }

  return results;
}

/**
 * Fetch bunkerindex.com, parse VLSFO+MGO for Rotterdam/Singapore/Fujairah, upsert to DB.
 *
 * Out-of-range prices are skipped (last-good preserved), warn logged.
 * Houston/Gibraltar are never touched.
 */
export async function refreshBunkerIndex(
  db: Database.Database,
  fetcher: HtmlFetcher = defaultFetcher,
): Promise<{ rowsChanged: number }> {
  const raw = await fetcher(BUNKERINDEX_URL);

  let entries: BunkerIndexEntry[];
  try {
    entries = parseBunkerIndexHtml(raw);
  } catch (e) {
    if (e instanceof BunkerIndexParseError) {
      console.warn(`[BunkerIndex] ${e.message}`);
      return { rowsChanged: 0 };
    }
    throw e;
  }

  if (entries.length === 0) {
    console.warn('[BunkerIndex] No target port rows found — page structure may have changed');
    return { rowsChanged: 0 };
  }

  const fetchedAt = new Date().toISOString();
  const priceDate = new Date().toISOString().slice(0, 10);
  let rowsChanged = 0;

  const upsert = db.transaction(() => {
    for (const entry of entries) {
      if (entry.vlsfo !== undefined) {
        if (entry.vlsfo < RANGE_VLSFO.min || entry.vlsfo > RANGE_VLSFO.max) {
          const last = getLatestBunkerPrice(db, entry.unlocode, 'VLSFO');
          console.warn(
            `[BunkerIndex] ${entry.portName} VLSFO ${entry.vlsfo} out of range ` +
            `[${RANGE_VLSFO.min}–${RANGE_VLSFO.max}] — keeping last-good ` +
            `(${last?.price_usd_per_mt ?? 'none'})`,
          );
        } else {
          upsertBunkerPrice(db, {
            port_unlocode: entry.unlocode,
            fuel_grade: 'VLSFO',
            price_usd_per_mt: entry.vlsfo,
            price_date: priceDate,
            source: 'bunkerindex',
            fetched_at: fetchedAt,
          });
          rowsChanged++;
        }
      }

      if (entry.mgo !== undefined) {
        if (entry.mgo < RANGE_MGO.min || entry.mgo > RANGE_MGO.max) {
          const last = getLatestBunkerPrice(db, entry.unlocode, 'MGO');
          console.warn(
            `[BunkerIndex] ${entry.portName} MGO ${entry.mgo} out of range ` +
            `[${RANGE_MGO.min}–${RANGE_MGO.max}] — keeping last-good ` +
            `(${last?.price_usd_per_mt ?? 'none'})`,
          );
        } else {
          upsertBunkerPrice(db, {
            port_unlocode: entry.unlocode,
            fuel_grade: 'MGO',
            price_usd_per_mt: entry.mgo,
            price_date: priceDate,
            source: 'bunkerindex',
            fetched_at: fetchedAt,
          });
          rowsChanged++;
        }
      }
    }
  });
  upsert();

  return { rowsChanged };
}

async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`BunkerIndex fetch failed: ${res.status} ${url}`);
  return res.text();
}
