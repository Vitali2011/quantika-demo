import type Database from 'better-sqlite3';
import { upsertIndex } from './market-indices-repository';

export const DREWRY_WCI_URL =
  'https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry';

export class DrewryStructureChangedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'DrewryStructureChangedError';
  }
}

// Current page structure (2026-05+): inline bullet text, e.g. "WCI) increased 6% to $2,712 per 40ft"
const WCI_VALUE_PATTERN_CURRENT =
  /World Container Index\s*\(WCI\)[^$]{0,200}\$\s*([\d,]+(?:\.\d+)?)/i;

// Legacy page structure: dedicated composite card, e.g. <h3>Composite</h3><div>$2,365</div>
const WCI_VALUE_PATTERN_LEGACY =
  /Composite[\s\S]{0,300}?\$\s*([\d,]+(?:\.\d+)?)/i;

// "DD Month YYYY" date string (e.g. "15 May 2026")
const WCI_DATE_PATTERN =
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i;

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

/**
 * Parses WCI composite value and publication date from Drewry page HTML.
 * Unit is USD/FEU — Drewry WCI measures rates per 40ft container (FEU).
 * Returns null if the value cannot be found (page structure changed).
 */
export function parseWciHtml(html: string): { value: number; date: string } | null {
  const valueMatch = html.match(WCI_VALUE_PATTERN_CURRENT) ?? html.match(WCI_VALUE_PATTERN_LEGACY);
  if (!valueMatch) return null;

  const value = parseFloat(valueMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 0) return null;

  const dateMatch = html.match(WCI_DATE_PATTERN);
  let indexDate: string;
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = MONTHS[dateMatch[2].toLowerCase()];
    const year = dateMatch[3];
    indexDate = month ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
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
  if (!res.ok) throw new Error(`Drewry WCI fetch failed: HTTP ${res.status}`);
  return res.text();
};

export async function refreshDrewryWci(
  db: Database.Database,
  fetcher: HtmlFetcher = defaultFetcher,
): Promise<{ rowsChanged: number }> {
  const html = await fetcher(DREWRY_WCI_URL);

  const parsed = parseWciHtml(html);
  if (!parsed) {
    throw new DrewryStructureChangedError(
      'WCI composite value not found in HTML — page structure may have changed',
    );
  }

  upsertIndex(db, {
    id: `drewry-bb-${parsed.date}`,
    index_name: 'drewry-bb',
    index_date: parsed.date,
    value: parsed.value,
    unit: 'USD/FEU',
    source: DREWRY_WCI_URL,
    fetched_at: new Date().toISOString(),
  });

  return { rowsChanged: 1 };
}
