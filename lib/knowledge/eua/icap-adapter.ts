import type Database from 'better-sqlite3';
import { upsertEuaPrice } from '@/lib/market/eua-repository';

const ICAP_URL = 'https://icapcarbonaction.com/en/ets-prices';

export class IcapNoEuEtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IcapNoEuEtsError';
  }
}

export type Fetcher = (url: string) => Promise<string>;

/**
 * Parse ICAP ETS prices CSV, extract the most recent EU ETS row.
 * Returns { price, priceDate }.
 */
export function parseIcapCsv(csv: string): { price: number; priceDate: string } {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new IcapNoEuEtsError('ICAP CSV has fewer than 2 lines');
  }

  const header = lines[0].split(',').map((h) => h.trim());
  const etsIdx = header.findIndex((h) => /^ets$/i.test(h));
  const dateIdx = header.findIndex((h) => /^date$/i.test(h));
  const priceIdx = header.findIndex((h) => /price/i.test(h));

  if (etsIdx === -1 || dateIdx === -1 || priceIdx === -1) {
    throw new IcapNoEuEtsError(
      `ICAP CSV missing required columns. Headers: ${header.join(', ')}`
    );
  }

  const euRows = lines
    .slice(1)
    .map((line) => line.split(',').map((c) => c.trim()))
    .filter((cols) => cols[etsIdx] === 'EU ETS');

  if (euRows.length === 0) {
    throw new IcapNoEuEtsError('No "EU ETS" rows found in ICAP CSV');
  }

  // Sort by date descending, pick newest
  euRows.sort((a, b) => b[dateIdx].localeCompare(a[dateIdx]));
  const newest = euRows[0];

  const priceDate = newest[dateIdx];
  const price = parseFloat(newest[priceIdx]);

  if (!priceDate || !Number.isFinite(price)) {
    throw new IcapNoEuEtsError('ICAP EU ETS row has invalid date or price');
  }

  return { price, priceDate };
}

/**
 * Fetch ICAP ETS prices CSV, parse EU ETS spot price, upsert into DB.
 */
export async function refreshIcap(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher
): Promise<{ rowsChanged: number; priceDate: string; price: number }> {
  const csv = await fetcher(ICAP_URL);
  const { price, priceDate } = parseIcapCsv(csv);

  upsertEuaPrice(db, {
    price_date: priceDate,
    price_eur_per_tco2: price,
    contract_type: 'spot',
    source: 'icap',
    fetched_at: new Date().toISOString(),
  });

  return { rowsChanged: 1, priceDate, price };
}

async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0' },
  });
  if (!res.ok) throw new Error(`ICAP fetch failed: ${res.status} ${url}`);
  return res.text();
}
