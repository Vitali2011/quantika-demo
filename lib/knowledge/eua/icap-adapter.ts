import type Database from 'better-sqlite3';
import { upsertEuaPrice } from '@/lib/market/eua-repository';

// ICAP Allowance Price Explorer JSON API — returns all ETS systems with historical data
const ICAP_API_URL = 'https://allowancepriceexplorer.icapcarbonaction.com/api/systems';

// EU ETS system id in the ICAP APE (system "from 2019", secondary market)
const EU_ETS_SYSTEM_ID = 34;

export class IcapNoEuEtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IcapNoEuEtsError';
  }
}

export type Fetcher = (url: string) => Promise<string>;

// ---------------------------------------------------------------------------
// JSON API parser
// ---------------------------------------------------------------------------

interface IcapSystem {
  id: number;
  name: string;
  values?: {
    secondary?: Record<string, number[]>;
    primary?: Record<string, number[]>;
  };
}

/**
 * Extract the most recent EU ETS secondary-market price from the ICAP APE
 * /api/systems JSON response.
 * Each date entry is an array: [EUR_price, USD_price?, ...]. We take index 0
 * which is the local-currency (EUR) value.
 */
export function parseIcapApiResponse(systems: IcapSystem[]): { price: number; priceDate: string } {
  const euEts = systems.find((s) => s.id === EU_ETS_SYSTEM_ID);
  if (!euEts) {
    throw new IcapNoEuEtsError(
      `EU ETS system (id=${EU_ETS_SYSTEM_ID}) not found in ICAP API response`,
    );
  }

  const values = euEts.values?.secondary ?? euEts.values?.primary;
  if (!values || Object.keys(values).length === 0) {
    throw new IcapNoEuEtsError('EU ETS system has no price data in ICAP API response');
  }

  // Keys are YYYY-MM-DD strings; pick the lexicographically largest (= newest)
  const dates = Object.keys(values).sort();
  const priceDate = dates[dates.length - 1];
  const priceArr = values[priceDate];
  const price = priceArr?.[0];

  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new IcapNoEuEtsError(`ICAP EU ETS price for ${priceDate} is not a valid number`);
  }

  return { price, priceDate };
}

// ---------------------------------------------------------------------------
// Legacy CSV parser — kept for backward compatibility with existing unit tests
// ---------------------------------------------------------------------------

/**
 * Parse ICAP ETS prices CSV, extract the most recent EU ETS row.
 */
export function parseIcapCsv(csv: string): { price: number; priceDate: string } {
  const lines = csv
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new IcapNoEuEtsError('ICAP CSV has fewer than 2 lines');
  }

  const header = lines[0].split(',').map((h) => h.trim());
  const etsIdx = header.findIndex((h) => /^ets$/i.test(h));
  const dateIdx = header.findIndex((h) => /^date$/i.test(h));
  const priceIdx = header.findIndex((h) => /price/i.test(h));

  if (etsIdx === -1 || dateIdx === -1 || priceIdx === -1) {
    throw new IcapNoEuEtsError(
      `ICAP CSV missing required columns. Headers: ${header.join(', ')}`,
    );
  }

  const euRows = lines
    .slice(1)
    .map((line) => line.split(',').map((c) => c.trim()))
    .filter((cols) => cols[etsIdx] === 'EU ETS');

  if (euRows.length === 0) {
    throw new IcapNoEuEtsError('No "EU ETS" rows found in ICAP CSV');
  }

  euRows.sort((a, b) => b[dateIdx].localeCompare(a[dateIdx]));
  const newest = euRows[0];

  const priceDate = newest[dateIdx];
  const price = parseFloat(newest[priceIdx]);

  if (!priceDate || !Number.isFinite(price)) {
    throw new IcapNoEuEtsError('ICAP EU ETS row has invalid date or price');
  }

  return { price, priceDate };
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

/**
 * Fetch ICAP Allowance Price Explorer JSON API, parse EU ETS secondary price,
 * upsert into DB.
 *
 * Returns null (+ logs a warning) when the API returns HTML (e.g. Cloudflare
 * challenge) or the JSON structure has no EU ETS entry.
 * Only re-throws on genuine network failures (fetcher rejection).
 */
export async function refreshIcap(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher,
): Promise<{ rowsChanged: number; priceDate: string; price: number } | null> {
  const raw = await fetcher(ICAP_API_URL);

  // Graceful-null: Cloudflare challenge or any non-JSON response
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    console.warn('[ICAP] API response is not JSON — possibly blocked by Cloudflare');
    return null;
  }

  let systems: IcapSystem[];
  try {
    systems = JSON.parse(raw) as IcapSystem[];
  } catch {
    console.warn('[ICAP] API response could not be parsed as JSON');
    return null;
  }

  const { price, priceDate } = parseIcapApiResponse(systems);

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
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ICAP fetch failed: ${res.status} ${url}`);
  return res.text();
}
