import type Database from 'better-sqlite3';
import { upsertIndex } from './market-indices-repository';

export const HANDYBULK_URL = 'https://www.handybulk.com/';

export class HandybulkStructureChangedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'HandybulkStructureChangedError';
  }
}

// Match <td>BHSI</td><td>530</td><td>22/05/2026</td>
const BHSI_VALUE_PATTERN =
  /<td[^>]*>\s*BHSI\s*<\/td>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)\s*<\/td>/i;

const BHSI_DATE_PATTERN =
  /<td[^>]*>\s*BHSI\s*<\/td>\s*<td[^>]*>[\d,]+(?:\.\d+)?\s*<\/td>\s*<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>/i;

/**
 * Parses BHSI value and date from handybulk.com HTML.
 * Returns null if the page structure has changed and the value cannot be found.
 */
export function parseBhsiHtml(html: string): { value: number; date: string } | null {
  const valueMatch = html.match(BHSI_VALUE_PATTERN);
  if (!valueMatch) return null;

  const value = parseFloat(valueMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 0) return null;

  // Extract date DD/MM/YYYY → YYYY-MM-DD; fall back to today if absent
  const dateMatch = html.match(BHSI_DATE_PATTERN);
  let indexDate: string;
  if (dateMatch) {
    const parts = dateMatch[1].split('/');
    indexDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
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
  if (!res.ok) throw new Error(`Handybulk fetch failed: HTTP ${res.status}`);
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

  return { rowsChanged: 1 };
}
