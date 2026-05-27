import type Database from 'better-sqlite3';
import { upsertBalticIndex } from './baltic-repository';

// stooq.com is now API-key-gated; HANDYBULK_BDI_URL is the active source.
// Kept for backward-compat (existing unit tests still cover the CSV path).
export const STOOQ_BDI_URL = 'https://stooq.com/q/d/l/?s=bdi&i=d';

// handybulk.com/baltic-dry-index/ — daily BDI summaries in paragraph format.
export const HANDYBULK_BDI_URL = 'https://www.handybulk.com/baltic-dry-index/';

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

export class BdiStructureChangedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BdiStructureChangedError';
  }
}

/**
 * @deprecated stooq.com now requires an API key. Use parseBdiHtml() instead.
 * Kept exported so existing tests continue to cover the CSV path.
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

/**
 * Parses BDI value and date from handybulk.com/baltic-dry-index/ HTML.
 * Scans for the first DD-Month-YYYY entry whose following text contains
 * "Baltic Dry Index (BDI) … X,XXX points".
 * Returns null if no matching entry is found.
 */
export function parseBdiHtml(html: string): { value: number; date: string } | null {
  const dateRegex =
    /(\d{1,2})-(January|February|March|April|May|June|July|August|September|October|November|December)-(\d{4})/gi;

  let m: RegExpExecArray | null;
  while ((m = dateRegex.exec(html)) !== null) {
    const [, day, monthName, year] = m;
    const month = MONTH_MAP[monthName.toLowerCase()];
    if (!month) continue;

    const date = `${year}-${month}-${day.padStart(2, '0')}`;
    const ctx = html.slice(m.index, m.index + 1500);

    const bdiM = ctx.match(
      /Baltic Dry Index[^(]*\(BDI\)[^.]*?(\d{1,2},\d{3}|\d{4,5})\s*points/i,
    );
    if (!bdiM) continue;

    const value = parseFloat(bdiM[1].replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;

    return { value, date };
  }

  return null;
}

export type CsvFetcher = (url: string) => Promise<string>;
export type HtmlFetcher = (url: string) => Promise<string>;

const defaultFetcher: HtmlFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0 (+https://demo.quantika.org)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Handybulk BDI fetch failed: HTTP ${res.status}`);
  return res.text();
};

export async function refreshBdi(
  db: Database.Database,
  fetcher: HtmlFetcher = defaultFetcher,
): Promise<{ rowsChanged: number }> {
  const html = await fetcher(HANDYBULK_BDI_URL);

  const parsed = parseBdiHtml(html);
  if (!parsed) {
    throw new BdiStructureChangedError(
      'BDI value not found in HTML — handybulk page structure may have changed',
    );
  }

  upsertBalticIndex(db, {
    index_code: 'BDI',
    value: parsed.value,
    price_date: parsed.date,
    source: HANDYBULK_BDI_URL,
  });

  return { rowsChanged: 1 };
}
