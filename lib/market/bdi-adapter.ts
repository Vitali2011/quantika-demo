import type Database from 'better-sqlite3';
import { upsertBalticIndex } from './baltic-repository';

// stooq.com free CSV endpoint for Baltic Dry Index (BDI), newest row first.
export const STOOQ_BDI_URL = 'https://stooq.com/q/d/l/?s=bdi&i=d';

export class BdiStructureChangedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BdiStructureChangedError';
  }
}

/**
 * Parses BDI value and date from a stooq.com CSV string.
 * Expected header: Date,Open,High,Low,Close,Volume (newest row first).
 * Returns null if the structure has changed or no rows are present.
 */
export function parseBdiCsv(csv: string): { value: number; date: string } | null {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;

  const header = lines[0].split(',');
  const dateIdx = header.indexOf('Date');
  const closeIdx = header.indexOf('Close');
  if (dateIdx === -1 || closeIdx === -1) return null;

  const parts = lines[1].split(',');
  if (parts.length <= Math.max(dateIdx, closeIdx)) return null;

  const date = parts[dateIdx].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const value = parseFloat(parts[closeIdx]);
  if (!Number.isFinite(value) || value <= 0) return null;

  return { value, date };
}

export type CsvFetcher = (url: string) => Promise<string>;

const defaultFetcher: CsvFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0 (+https://demo.quantika.org)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Stooq BDI fetch failed: HTTP ${res.status}`);
  return res.text();
};

export async function refreshBdi(
  db: Database.Database,
  fetcher: CsvFetcher = defaultFetcher,
): Promise<{ rowsChanged: number }> {
  const csv = await fetcher(STOOQ_BDI_URL);

  const parsed = parseBdiCsv(csv);
  if (!parsed) {
    throw new BdiStructureChangedError(
      'BDI value not found in CSV — stooq page structure may have changed',
    );
  }

  upsertBalticIndex(db, {
    index_code: 'BDI',
    value: parsed.value,
    price_date: parsed.date,
    source: STOOQ_BDI_URL,
  });

  return { rowsChanged: 1 };
}
