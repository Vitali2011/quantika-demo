import type Database from 'better-sqlite3';
import { upsertBunkerPrice } from '@/lib/market/bunker-repository';

const USDA_URL = 'https://agtransport.usda.gov/resource/y4ft-fdwn.json?$limit=1000';

const LOCATION_TO_UNLOCODE: Record<string, string> = {
  Rotterdam: 'NLRTM',
  Singapore: 'SGSIN',
  Fujairah: 'AEFJR',
  Houston: 'USHOU',
  Gibraltar: 'GIGIB',
};

const FUEL_MAP: Record<string, string> = {
  IFO380: 'VLSFO',
  MGO: 'MGO',
};

export interface UsdaRecord {
  location: string;
  fuel_type: string;
  price_per_mt: string;
  report_date: string;
}

export type Fetcher = (url: string) => Promise<UsdaRecord[]>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0 (+https://demo.quantika.org)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`USDA fetch failed: HTTP ${res.status}`);
  return res.json() as Promise<UsdaRecord[]>;
};

export async function refreshUsdaBunker(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher,
): Promise<{ rowsChanged: number; upstreamVersion: string }> {
  const records = await fetcher(USDA_URL);

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('USDA returned empty or invalid response');
  }

  const fetchedAt = new Date().toISOString();
  let rowsChanged = 0;

  const upsert = db.transaction(() => {
    for (const rec of records) {
      const portUnlocode = LOCATION_TO_UNLOCODE[rec.location];
      const fuelGrade = FUEL_MAP[rec.fuel_type];

      // Skip unknown locations or fuel types
      if (!portUnlocode || !fuelGrade) continue;

      const priceValue = parseFloat(rec.price_per_mt);
      if (!Number.isFinite(priceValue)) continue;

      const priceDate = rec.report_date.slice(0, 10);

      upsertBunkerPrice(db, {
        port_unlocode: portUnlocode,
        fuel_grade: fuelGrade,
        price_usd_per_mt: priceValue,
        price_date: priceDate,
        source: 'usda',
        fetched_at: fetchedAt,
      });
      rowsChanged++;
    }
  });
  upsert();

  // upstreamVersion: date of the most recent record
  const latestDate = records
    .filter((r) => LOCATION_TO_UNLOCODE[r.location] && FUEL_MAP[r.fuel_type])
    .map((r) => r.report_date.slice(0, 10))
    .sort()
    .at(-1) ?? new Date().toISOString().slice(0, 10);

  return { rowsChanged, upstreamVersion: latestDate };
}
