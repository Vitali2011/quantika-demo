import type Database from 'better-sqlite3';
import { upsertIndex } from './market-indices-repository';
import { upsertBalticIndex } from './baltic-repository';

// The homepage (https://www.handybulk.com/) is now fully JS-rendered with no
// static BHSI table.  The /baltic-dry-index/ subpage serves daily paragraph
// summaries in static HTML that include BHSI values.
export const HANDYBULK_URL = 'https://www.handybulk.com/baltic-dry-index/';

export class HandybulkStructureChangedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'HandybulkStructureChangedError';
  }
}

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

// Match: "Baltic Handysize Index (BHSI) ... to 843 points" or "... to 1,234 points"
const BHSI_VALUE_PATTERN =
  /Baltic Handysize Index[^(]*\(BHSI\)[^.]*?(\d{1,2},\d{3}|\d{3,4})\s*points/i;

// Match: DD-Month-YYYY (e.g. 22-May-2026)
const DATE_PATTERN =
  /(\d{1,2})-(January|February|March|April|May|June|July|August|September|October|November|December)-(\d{4})/gi;

/**
 * Parses BHSI value and date from handybulk.com/baltic-dry-index/ HTML.
 * Finds the first "Baltic Handysize Index (BHSI) ... NNN points" sentence and
 * the nearest DD-Month-YYYY date that precedes it.
 * Returns null if the page structure has changed and the value cannot be found.
 */
export function parseBhsiHtml(html: string): { value: number; date: string } | null {
  const valueMatch = html.match(BHSI_VALUE_PATTERN);
  if (!valueMatch) return null;

  const value = parseFloat(valueMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;

  // Find the latest DD-Month-YYYY date that appears before the BHSI value
  const beforeValue = html.slice(0, html.indexOf(valueMatch[0]));
  const dateMatches = [...beforeValue.matchAll(DATE_PATTERN)];

  let indexDate: string;
  if (dateMatches.length > 0) {
    const last = dateMatches[dateMatches.length - 1];
    const [, day, monthName, year] = last;
    const month = MONTH_MAP[monthName.toLowerCase()];
    indexDate = month
      ? `${year}-${month}-${day.padStart(2, '0')}`
      : new Date().toISOString().slice(0, 10);
  } else {
    indexDate = new Date().toISOString().slice(0, 10);
  }

  return { value, date: indexDate };
}

export type HtmlFetcher = (url: string) => Promise<string>;

const defaultFetcher: HtmlFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0 (+https://demo.quantika.org)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Handybulk BHSI fetch failed: HTTP ${res.status}`);
  return res.text();
};

export async function refreshBhsi(
  db: Database.Database,
  fetcher: HtmlFetcher = defaultFetcher,
): Promise<{ rowsChanged: number }> {
  const html = await fetcher(HANDYBULK_URL);

  const parsed = parseBhsiHtml(html);
  if (!parsed) {
    throw new HandybulkStructureChangedError(
      'BHSI value not found in HTML — page structure may have changed',
    );
  }

  upsertIndex(db, {
    id: `bhsi-${parsed.date}`,
    index_name: 'bhsi',
    index_date: parsed.date,
    value: parsed.value,
    unit: 'USD/day',
    source: HANDYBULK_URL,
    fetched_at: new Date().toISOString(),
  });

  // /api/market/baltic-kpi and /api/market/indices both read BHSI from
  // baltic_indices, not market_indices (#558).
  upsertBalticIndex(db, {
    index_code: 'BHSI',
    value: parsed.value,
    price_date: parsed.date,
    source: HANDYBULK_URL,
  });

  return { rowsChanged: 1 };
}
