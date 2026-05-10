import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { upsertBunkerPrice } from '@/lib/market/bunker-repository';

const SNB_URL = 'https://shipandbunker.com/prices';
const DEFAULT_CACHE_PATH = '/var/cache/quantika/shipandbunker.html';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class ShipAndBunkerParseError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ShipAndBunkerParseError';
  }
}

const LOCATION_TO_UNLOCODE: Record<string, string> = {
  Rotterdam: 'NLRTM',
  Singapore: 'SGSIN',
  Fujairah: 'AEFJR',
  Houston: 'USHOU',
  Gibraltar: 'GIGIB',
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

export function parseShipAndBunkerHtml(html: string): Map<string, { vlsfo: number; unlocode: string }> {
  const result = new Map<string, { vlsfo: number; unlocode: string }>();

  const ROW_PATTERN = /<tr[^>]*class="[^"]*port-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = ROW_PATTERN.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    const portMatch = /<td[^>]*class="[^"]*port-name[^"]*"[^>]*>\s*([^<]+)\s*<\/td>/i.exec(rowHtml);
    const vlsfoMatch = /<td[^>]*class="[^"]*vlsfo[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(rowHtml);

    if (!portMatch || !vlsfoMatch) continue;

    const portName = portMatch[1].trim();
    const unlocode = LOCATION_TO_UNLOCODE[portName];
    if (!unlocode) continue;

    const vlsfoRaw = vlsfoMatch[1].replace(/<[^>]+>/g, '').trim();
    const vlsfo = parseFloat(vlsfoRaw);
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
  // Try cache first
  let html = readCache();

  if (!html) {
    html = await fetcher(SNB_URL);
    writeCache(html);
  }

  const parsed = parseShipAndBunkerHtml(html);

  if (parsed.size === 0) {
    throw new ShipAndBunkerParseError(
      'No port rows found in HTML — page structure may have changed',
    );
  }

  const fetchedAt = new Date().toISOString();
  const priceDate = new Date().toISOString().slice(0, 10);
  let rowsChanged = 0;

  const upsert = db.transaction(() => {
    for (const [, { vlsfo, unlocode }] of parsed) {
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
