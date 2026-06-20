import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { upsertBunkerPrice, getLatestBunkerPrice } from '@/lib/market/bunker-repository';

// Bunker sanity range (USD/mt). Mirrors oilmonster-adapter — reject implausible
// scrapes (decimal-shift, header-as-price) instead of writing them to the DB.
const RANGE_VLSFO = { min: 200, max: 2500 } as const;

const SNB_URL = 'https://shipandbunker.com/prices';
const DEFAULT_CACHE_PATH = '/var/cache/quantika/shipandbunker.html';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class ShipAndBunkerParseError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ShipAndBunkerParseError';
  }
}

export class ShipAndBunkerStructureChangedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ShipAndBunkerStructureChangedError';
  }
}

// Port code from row ID (e.g. "nl-rtm" → "NLRTM") used as fallback UNLOCODE
// when not in the explicit map. Format: country-port → COUNTRYPORT (2+3 chars).
const LOCATION_TO_UNLOCODE: Record<string, string> = {
  Rotterdam: 'NLRTM',
  Singapore: 'SGSIN',
  Fujairah: 'AEFJR',
  Houston: 'USHOU',
  'LA / Long Beach': 'USLAX',
  'Hong Kong': 'CNHKG',
  'New York': 'USNYC',
  Santos: 'BRSSZ',
  'Panama': 'PAPAI',
  'Balboa': 'PAPAI',
  'Busan': 'KRBSN',
  'Tokyo': 'JPTYO',
  'Shanghai': 'CNSHA',
  'Durban': 'ZADUR',
  'Cape Town': 'ZACPT',
  'Gibraltar': 'GIGIB',
  'Las Palmas': 'ESLPA',
  'Barcelona': 'ESBCN',
  // Piraeus (GRPIR) and Istanbul (TRIST) are not quoted on the free S&B global page.
  // East-Med/Black Sea coverage is provided by the OilMonster per-port adapter.
  'Colombo': 'LKCMB',
  'Port Klang': 'MYPKG',
  'Zhoushan': 'CNZOS',
};

function getCachePath(): string {
  return process.env.BUNKER_CACHE_PATH ?? DEFAULT_CACHE_PATH;
}

function readCache(): string | null {
  const cachePath = getCachePath();
  try {
    const st = fs.statSync(cachePath);
    if (Date.now() - st.mtimeMs < CACHE_TTL_MS) {
      return fs.readFileSync(cachePath, 'utf-8');
    }
  } catch {
    // Cache miss or not writable — silent
  }
  return null;
}

function writeCache(html: string): void {
  const cachePath = getCachePath();
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, html);
  } catch {
    // Not writable — skip silently
  }
}

// Real page structure:
//   <th id="row-XX-YYY-VLSFO" class="port"><a href="...">PortName</a></th>
//   ... whitespace ...
//   <td headers="price-VLSFO">PRICE<span ...></span></td>
// Rows with id="row-av-*-VLSFO" are regional averages, not real ports — skip them.
const ENTRY_PATTERN =
  /<th[^>]*id="row-([^"]*)-VLSFO"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/th>[\s\S]*?<td[^>]*headers="price-VLSFO"[^>]*>([\d.]+)/gi;

/**
 * Derive a UNLOCODE from the row ID segment (e.g. "nl-rtm" → "NLRTM").
 * IDs follow pattern "{country}-{port}", both 2-3 lowercase chars.
 */
function unlocodeFromRowId(rowId: string): string | null {
  const parts = rowId.split('-');
  if (parts.length < 2) return null;
  // country (2 chars) + port (2-3 chars) — join first two segments
  const country = parts[0].toUpperCase();
  const port = parts[1].toUpperCase();
  if (country.length !== 2) return null;
  return country + port;
}

export function parseShipAndBunkerHtml(html: string): Map<string, { vlsfo: number; unlocode: string }> {
  // Detect structurally broken HTML — no VLSFO price table signatures at all
  if (!html.includes('price-VLSFO')) {
    throw new ShipAndBunkerStructureChangedError(
      'HTML contains no VLSFO price table — page structure may have changed',
    );
  }

  const result = new Map<string, { vlsfo: number; unlocode: string }>();

  ENTRY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENTRY_PATTERN.exec(html)) !== null) {
    const rowId = match[1].trim();  // e.g. "nl-rtm" or "av-g20"
    const portName = match[2].trim();
    const priceStr = match[3];

    // Skip regional/global averages
    if (rowId.startsWith('av-')) continue;

    // Prefer explicit UNLOCODE map, fall back to deriving from row ID
    const unlocode = LOCATION_TO_UNLOCODE[portName] ?? unlocodeFromRowId(rowId);
    if (!unlocode) continue;

    const vlsfo = parseFloat(priceStr);
    if (!Number.isFinite(vlsfo)) continue;

    result.set(portName, { vlsfo, unlocode });
  }

  return result;
}

export type HtmlFetcher = (url: string) => Promise<string>;

const defaultFetcher: HtmlFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0 (+https://demo.quantika.org)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ship&Bunker fetch failed: HTTP ${res.status}`);
  return res.text();
};

export async function refreshShipAndBunker(
  db: Database.Database,
  fetcher: HtmlFetcher = defaultFetcher,
): Promise<{ rowsChanged: number }> {
  let html = readCache();

  if (!html) {
    html = await fetcher(SNB_URL);
    writeCache(html);
  }

  const parsed = parseShipAndBunkerHtml(html);

  if (parsed.size === 0) {
    throw new ShipAndBunkerStructureChangedError(
      'No port rows found in HTML — page structure may have changed',
    );
  }

  const fetchedAt = new Date().toISOString();
  const priceDate = new Date().toISOString().slice(0, 10);
  let rowsChanged = 0;

  const upsert = db.transaction(() => {
    for (const [portName, { vlsfo, unlocode }] of parsed) {
      if (vlsfo < RANGE_VLSFO.min || vlsfo > RANGE_VLSFO.max) {
        const last = getLatestBunkerPrice(db, unlocode, 'VLSFO');
        console.warn(
          `[ShipAndBunker] ${portName} VLSFO ${vlsfo} out of range ` +
          `[${RANGE_VLSFO.min}–${RANGE_VLSFO.max}] — keeping last-good ` +
          `(${last?.price_usd_per_mt ?? 'none'})`,
        );
        continue;
      }
      upsertBunkerPrice(db, {
        port_unlocode: unlocode,
        fuel_grade: 'VLSFO',
        price_usd_per_mt: vlsfo,
        price_date: priceDate,
        source: 'shipandbunker',
        fetched_at: fetchedAt,
      });
      rowsChanged++;
    }
  });
  upsert();

  return { rowsChanged };
}
