import type Database from 'better-sqlite3';
import { upsertBalticIndex } from './baltic-repository';

// Same source page as BDI/BHSI — all four Baltic indices appear in daily paragraphs.
export const HANDYBULK_BCI_URL = 'https://www.handybulk.com/baltic-dry-index/';

export class BciStructureChangedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BciStructureChangedError';
  }
}

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

// Match: "Baltic Capesize Index (BCI) ... to 4,954 points" or "... to 4954 points"
// The `to\s+` anchor avoids matching the intermediate "increased by X points" fragment.
const BCI_VALUE_PATTERN =
  /Baltic Capesize Index[^(]*\(BCI\)[^.]*?\bto\s+(?:reach\s+)?(\d{1,2},\d{3}|\d{3,5})\s*points/i;

// Match: DD-Month-YYYY (e.g. 22-May-2026)
const DATE_PATTERN =
  /(\d{1,2})-(January|February|March|April|May|June|July|August|September|October|November|December)-(\d{4})/gi;

/**
 * Parses BCI value and date from handybulk.com/baltic-dry-index/ HTML.
 * Finds the first "Baltic Capesize Index (BCI) ... NNN points" sentence and
 * the nearest DD-Month-YYYY date that precedes it.
 * Returns null if the page structure has changed and the value cannot be found.
 */
export function parseBciHtml(html: string): { value: number; date: string } | null {
  const valueMatch = html.match(BCI_VALUE_PATTERN);
  if (!valueMatch) return null;

  const value = parseFloat(valueMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;

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
  if (!res.ok) throw new Error(`Handybulk BCI fetch failed: HTTP ${res.status}`);
  return res.text();
};

export async function refreshBci(
  db: Database.Database,
  fetcher: HtmlFetcher = defaultFetcher,
): Promise<{ rowsChanged: number }> {
  const html = await fetcher(HANDYBULK_BCI_URL);

  const parsed = parseBciHtml(html);
  if (!parsed) {
    throw new BciStructureChangedError(
      'BCI value not found in HTML — handybulk page structure may have changed',
    );
  }

  upsertBalticIndex(db, {
    index_code: 'BCI',
    value: parsed.value,
    price_date: parsed.date,
    source: HANDYBULK_BCI_URL,
  });

  return { rowsChanged: 1 };
}
