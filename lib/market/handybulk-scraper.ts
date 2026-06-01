/**
 * Baltic indices unified scraper.
 *
 * Fetches handybulk.com/baltic-dry-index/ ONCE and parses BDI/BCI/BSI/BHSI/BPI
 * from the most-recent dated section. Range-validates each value; out-of-range
 * values are skipped (keeps last good row in DB). Falls back to
 * tradingeconomics.com/commodity/baltic (BDI/BCI/BSI/BPI, no BHSI) if HandyBulk
 * is unreachable or yields 0 valid indices. If both sources fail, existing rows
 * are preserved — never throws.
 *
 * INTERIM SCRAPE for demo: Baltic Exchange data requires a licensed feed in prod.
 */

import type Database from 'better-sqlite3';
import { upsertBalticIndex, getLatestBalticIndex } from './baltic-repository';
import { upsertIndex } from './market-indices-repository';

export const HANDYBULK_URL = 'https://www.handybulk.com/baltic-dry-index/';
export const TE_COMMODITY_URL = 'https://tradingeconomics.com/commodity/baltic';

export const RANGE_BOUNDS: Readonly<Record<string, readonly [number, number]>> = {
  BDI:  [300, 15000],
  BCI:  [300, 20000],
  BSI:  [200,  8000],
  BHSI: [200,  4000],
  BPI:  [300, 15000],
};

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

// DD-Month-YYYY format used on handybulk.com (e.g. "22-May-2026")
const HB_DATE_SOURCE =
  '(\\d{1,2})-(January|February|March|April|May|June|July|August|September|October|November|December)-(\\d{4})';

// Each pattern anchors on "to [reach] VALUE points" to avoid matching the delta.
const HB_PATTERNS: Record<string, RegExp> = {
  BDI:  /Baltic Dry Index[^(]*\(BDI\)[^.]*?\bto\s+(?:reach\s+)?(\d{1,2},\d{3}|\d{4,5})\s*points/i,
  BCI:  /Baltic Capesize Index[^(]*\(BCI\)[^.]*?\bto\s+(?:reach\s+)?(\d{1,2},\d{3}|\d{3,5})\s*points/i,
  BSI:  /Baltic Supramax Index[^(]*\(BSI\)[^.]*?\bto\s+(?:reach\s+)?(\d{1,2},\d{3}|\d{3,5})\s*points/i,
  BHSI: /Baltic Handysize Index[^(]*\(BHSI\)[^.]*?\bto\s+(?:reach\s+)?(\d{1,2},\d{3}|\d{3,4})\s*points/i,
  BPI:  /Baltic Panamax Index[^(]*\(BPI\)[^.]*?\bto\s+(?:reach\s+)?(\d{1,2},\d{3}|\d{3,5})\s*points/i,
};

// Trading Economics embedded JSON: {"Symbol":"BDI","Last":1842,"Date":"2026-05-28"}
// Symbol map: TE uses Bloomberg tickers for some indices
const TE_SYMBOL_MAP: Record<string, string> = {
  BDI: 'BDI', BALDRY: 'BDI',
  BCI: 'BCI',
  BSI: 'BSI',
  BPI: 'BPI',
  // BHSI intentionally absent — TE fallback covers only 4 indices
};

export interface ParsedIndex {
  value: number;
  price_date: string;
}

export type ParsedIndices = Partial<Record<string, ParsedIndex>>;

/**
 * Parses Baltic indices from the most-recent dated section of HandyBulk HTML.
 * Returns a map of {code → {value, price_date}}. Missing indices are absent.
 */
export function parseHandybulkHtml(html: string): ParsedIndices {
  const result: ParsedIndices = {};
  const dateRe = new RegExp(HB_DATE_SOURCE, 'gi');

  const firstMatch = dateRe.exec(html);
  if (!firstMatch) return result;

  const [, day, monthName, year] = firstMatch;
  const month = MONTH_MAP[monthName.toLowerCase()];
  if (!month) return result;
  const date = `${year}-${month}-${day.padStart(2, '0')}`;

  // Bound the context to this section only (stops at next date heading).
  const nextMatch = dateRe.exec(html);
  const ctxEnd = nextMatch ? nextMatch.index : firstMatch.index + 5000;
  const ctx = html.slice(firstMatch.index, ctxEnd);

  for (const [code, pattern] of Object.entries(HB_PATTERNS)) {
    const m = ctx.match(pattern);
    if (!m) continue;
    const value = parseFloat(m[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) {
      result[code] = { value, price_date: date };
    }
  }

  return result;
}

/**
 * Parses Baltic indices from Trading Economics embedded JSON.
 * Covers BDI/BCI/BSI/BPI — BHSI is not available on this page.
 * Expected format in script tags: [{"Symbol":"BDI","Last":1842,"Date":"2026-05-28"}, ...]
 */
export function parseTradingEconomicsHtml(html: string): ParsedIndices {
  const result: ParsedIndices = {};
  // Match JSON-like objects; fields can be in any order within each object.
  const blockRe = /\{[^{}]{5,400}\}/g;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[0];
    const symM = /"Symbol"\s*:\s*"([A-Z]{2,6})"/.exec(block);
    const lastM = /"Last"\s*:\s*([\d.]+)/.exec(block);
    const dateM = /"Date"\s*:\s*"(\d{4}-\d{2}-\d{2})/.exec(block);

    if (!symM || !lastM) continue;

    const code = TE_SYMBOL_MAP[symM[1].toUpperCase()];
    if (!code || result[code]) continue;

    const value = parseFloat(lastM[1]);
    if (!Number.isFinite(value) || value <= 0) continue;

    result[code] = {
      value,
      price_date: dateM ? dateM[1] : new Date().toISOString().slice(0, 10),
    };
  }

  return result;
}

export type HtmlFetcher = (url: string) => Promise<string>;

const defaultFetcher: HtmlFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0 (+https://demo.quantika.org)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`fetch ${url} HTTP ${res.status}`);
  return res.text();
};

function inRange(code: string, value: number): boolean {
  const bounds = RANGE_BOUNDS[code];
  return !!bounds && value >= bounds[0] && value <= bounds[1];
}

function upsertValidIndices(
  db: Database.Database,
  parsed: ParsedIndices,
  source: string,
): number {
  let count = 0;
  for (const [code, entry] of Object.entries(parsed)) {
    if (!entry) continue;
    const { value, price_date } = entry;
    if (!inRange(code, value)) {
      const latest = getLatestBalticIndex(db, code);
      console.warn(
        `[market-handybulk] ${code}=${value} out of range [${RANGE_BOUNDS[code]?.join('-')}] — skipping (last good: ${latest?.value ?? 'none'} on ${latest?.price_date ?? '-'})`,
      );
      continue;
    }
    upsertBalticIndex(db, { index_code: code, value, price_date, source });
    // BHSI must also be in market_indices — /api/market/benchmark reads from there.
    if (code === 'BHSI') {
      upsertIndex(db, {
        id: `bhsi-${price_date}`,
        index_name: 'bhsi',
        index_date: price_date,
        value,
        unit: 'USD/day',
        source,
        fetched_at: new Date().toISOString(),
      });
    }
    count++;
  }
  return count;
}

/**
 * Fetches HandyBulk (primary) once and upserts all valid Baltic indices.
 * Falls back to Trading Economics if HandyBulk is unreachable or yields 0 valid.
 * Never throws — both sources failing leaves existing DB rows intact.
 */
export async function refreshAllBalticIndices(
  db: Database.Database,
  fetchers: { hb?: HtmlFetcher; te?: HtmlFetcher } = {},
): Promise<{ rowsChanged: number }> {
  const hbFetch = fetchers.hb ?? defaultFetcher;
  const teFetch = fetchers.te ?? defaultFetcher;

  // Primary: HandyBulk
  let hbCount = 0;
  try {
    const html = await hbFetch(HANDYBULK_URL);
    hbCount = upsertValidIndices(db, parseHandybulkHtml(html), HANDYBULK_URL);
  } catch (e) {
    console.warn(`[market-handybulk] HandyBulk unavailable: ${(e as Error).message}`);
  }

  if (hbCount > 0) return { rowsChanged: hbCount };

  // Fallback: Trading Economics (BDI/BCI/BSI/BPI — no BHSI)
  let teCount = 0;
  try {
    const html = await teFetch(TE_COMMODITY_URL);
    teCount = upsertValidIndices(db, parseTradingEconomicsHtml(html), TE_COMMODITY_URL);
  } catch (e) {
    console.warn(`[market-handybulk] Trading Economics fallback unavailable: ${(e as Error).message}`);
  }

  if (teCount === 0) {
    console.warn('[market-handybulk] Both sources unavailable — retaining existing Baltic indices');
  }

  return { rowsChanged: teCount };
}
