import type Database from 'better-sqlite3';
import { upsertEuaPrice } from '@/lib/market/eua-repository';

const EEX_HUB_URL =
  'https://www.eex.com/en/market-data/market-data-hub/environmentals/eu-ets-auctions';

const CSV_LINK_RE = /href="([^"]+auction-results-(\d{4}-\d{2}-\d{2})[^"]*\.csv)"/gi;
const BASE_URL = 'https://www.eex.com';

export class EexNoAuctionFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EexNoAuctionFoundError';
  }
}

export class EexCsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EexCsvFormatError';
  }
}

export type Fetcher = (url: string) => Promise<string>;

/**
 * Parse EEX auction CSV and extract the clearing price.
 * Returns { price, priceDate }.
 */
export function parseEexCsv(csv: string): { price: number; priceDate: string } {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new EexCsvFormatError('EEX CSV has fewer than 2 lines (header + data)');
  }

  const header = lines[0].split(',');
  const clearingPriceIdx = header.findIndex((col) => /Auction Clearing Price/i.test(col));
  if (clearingPriceIdx === -1) {
    throw new EexCsvFormatError(
      `EEX CSV missing "Auction Clearing Price" column. Headers: ${header.join(', ')}`
    );
  }

  // Take the first data row
  const dataRow = lines[1].split(',');
  const priceDate = dataRow[0]?.trim();
  const priceStr = dataRow[clearingPriceIdx]?.trim();

  if (!priceDate || !priceStr) {
    throw new EexCsvFormatError('EEX CSV data row is missing date or price');
  }

  const price = parseFloat(priceStr);
  if (!Number.isFinite(price)) {
    throw new EexCsvFormatError(`EEX CSV clearing price is not a number: "${priceStr}"`);
  }

  return { price, priceDate };
}

/**
 * Extract the latest auction CSV URL and its date from the EEX hub page HTML.
 * Returns { csvUrl, csvDate } where csvDate is 'YYYY-MM-DD'.
 */
export function extractLatestCsvUrl(
  html: string
): { csvUrl: string; csvDate: string } {
  const candidates: { url: string; date: string }[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex each call (global regex)
  CSV_LINK_RE.lastIndex = 0;
  while ((match = CSV_LINK_RE.exec(html)) !== null) {
    candidates.push({ url: match[1], date: match[2] });
  }

  if (candidates.length === 0) {
    throw new EexNoAuctionFoundError(
      'No auction-results CSV links found on EEX hub page'
    );
  }

  // Pick the one with the latest date string (lexicographic sort works for YYYY-MM-DD)
  candidates.sort((a, b) => b.date.localeCompare(a.date));
  const latest = candidates[0];

  // Resolve to absolute URL if needed
  const csvUrl = latest.url.startsWith('http') ? latest.url : `${BASE_URL}${latest.url}`;
  return { csvUrl, csvDate: latest.date };
}

/**
 * Fetch hub page, find latest CSV, parse clearing price, upsert into DB.
 */
export async function refreshEex(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher
): Promise<{ rowsChanged: number; priceDate: string; price: number }> {
  // 1. Fetch hub HTML
  const html = await fetcher(EEX_HUB_URL);

  // 2. Extract latest CSV URL + date
  const { csvUrl } = extractLatestCsvUrl(html);

  // 3. Fetch CSV
  const csv = await fetcher(csvUrl);

  // 4. Parse clearing price
  const { price, priceDate } = parseEexCsv(csv);

  // 5. Upsert
  upsertEuaPrice(db, {
    price_date: priceDate,
    price_eur_per_tco2: price,
    contract_type: 'spot',
    source: 'eex-auction',
    fetched_at: new Date().toISOString(),
  });

  return { rowsChanged: 1, priceDate, price };
}

async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0' },
  });
  if (!res.ok) throw new Error(`EEX fetch failed: ${res.status} ${url}`);
  return res.text();
}
