// DEMO: interim HTML scrape of oilmonster.com for demonstration purposes.
// Production deployment requires a licensed API or official data source.
import type Database from 'better-sqlite3';
import { upsertBunkerPrice, getLatestBunkerPrice } from '@/lib/market/bunker-repository';

export const OILMONSTER_URL = 'https://www.oilmonster.com/bunker-price';

// Exact link-text → UNLOCODE. Covers 5 global hubs + Med regional hubs.
// Istanbul (TRIST) and Piraeus (GRPIR) are served via per-port pages below.
// Constanta (ROCND) is derived as a proxy from Istanbul — not from the main table.
const PORT_MAP: ReadonlyMap<string, string> = new Map([
  ['Rotterdam', 'NLRTM'],
  ['Singapore', 'SGSIN'],
  ['Fujairah', 'AEFJR'],
  ['Houston', 'USHOU'],
  ['Gibraltar', 'GIGIB'],
  ['Port Said', 'EGPSD'],
  ['Augusta', 'ITAUG'],
  ['Ceuta', 'ESCEU'],
  ['Limassol', 'CYLMS'],
]);

// Per-port VLSFO pages for East-Med / Black Sea ports not in the main table.
const PER_PORT_URLS: ReadonlyMap<string, string> = new Map([
  ['TRIST', 'https://www.oilmonster.com/bunker-fuel-prices/istanbul-vlsfo-price/239/91'],
  ['GRPIR', 'https://www.oilmonster.com/bunker-fuel-prices/piraeus-vlsfo-price/239/97'],
]);

// Black Sea premium applied to Istanbul price to derive Constanta (ROCND).
const BLACK_SEA_PREMIUM_USD = 40;

// Per-port prices older than this are skipped (auto-excludes dormant feeds).
const MAX_AGE_DAYS = 30;

// Range bounds for price sanity — wider than bunkerindex due to broader port coverage
const RANGE_VLSFO = { min: 200, max: 2000 } as const;
const RANGE_MGO = { min: 200, max: 2000 } as const;

export class OilMonsterParseError extends Error {
  constructor(msg: string) { super(msg); this.name = 'OilMonsterParseError'; }
}

export class OilMonsterStructureChangedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'OilMonsterStructureChangedError'; }
}

export interface OilMonsterEntry {
  portName: string;
  unlocode: string;
  vlsfo?: number;
  mgo?: number;
}

export type HtmlFetcher = (url: string) => Promise<string>;

function extractColumnIndices(theadHtml: string): { vlsfoIdx: number; mgoIdx: number } {
  const thPattern = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  const columns: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = thPattern.exec(theadHtml)) !== null) {
    // Strip child HTML elements (e.g. footnote <sup>1</sup>) including their text
    // content before exact-match column detection; plain strip of tags leaves inner
    // text ("VLSFO<sup>1</sup>" → "VLSFO1" not "VLSFO").
    const label = m[1]
      .replace(/<[a-zA-Z][^>]*>[\s\S]*?<\/[a-zA-Z]+>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()
      .toLowerCase();
    columns.push(label);
  }
  return {
    vlsfoIdx: columns.findIndex(c => c === 'vlsfo'),
    mgoIdx: columns.findIndex(c => c === 'mgo'),
  };
}

function parseTdValue(tdContent: string): number | undefined {
  // Decode &nbsp; entity (used for cell padding on some sites)
  const decoded = tdContent.replace(/&nbsp;/gi, ' ');
  const stripped = decoded.replace(/<[^>]+>/g, '').trim();
  if (stripped === '--' || stripped === '') return undefined;
  // Strip leading non-numeric prefix (e.g. '$', '€', 'USD ') before parseFloat
  const cleaned = stripped.replace(/,/g, '').replace(/^[^0-9.-]+/, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Strip non-price nested <table> elements iteratively (innermost first) to prevent
// a lazy </tr> regex inside a <td> from truncating the outer data row.
function flattenNestedTables(html: string): string {
  // Match innermost tables that lack restable/gradelisttable class markers
  const innermostNonPrice =
    /<table(?![^>]*(?:restable|gradelisttable))[^>]*>((?:(?!<table)[\s\S])*?)<\/table>/gi;
  let out = html;
  let prev: string;
  do {
    prev = out;
    // Keep text content; strip <tr>/<td> structure tags to defuse the row regex
    out = out.replace(innermostNonPrice, (_, content) =>
      content.replace(/<\/?(?:tr|td)[^>]*>/gi, ''),
    );
  } while (out !== prev);
  return out;
}

/**
 * Parses VLSFO and MGO prices for target ports from oilmonster.com HTML.
 *
 * Column positions are resolved dynamically from the first `<thead>` found
 * (all regional tables share the same header structure). Rows are scanned
 * across all regional tables; non-target ports are silently skipped.
 *
 * "Duqm  Fujairah" and other partial-name variants will NOT match "Fujairah"
 * because PORT_MAP requires exact link-text equality.
 */
export function parseOilMonsterHtml(html: string): OilMonsterEntry[] {
  if (!html.includes('restable') && !html.includes('gradelisttable')) {
    throw new OilMonsterParseError(
      'OilMonster HTML contains no price tables — page structure may have changed',
    );
  }

  const flat = flattenNestedTables(html);
  const theadMatch = /<thead[^>]*>([\s\S]*?)<\/thead>/i.exec(flat);
  if (!theadMatch) {
    throw new OilMonsterParseError('No thead found in OilMonster HTML');
  }

  const { vlsfoIdx, mgoIdx } = extractColumnIndices(theadMatch[1]);
  if (vlsfoIdx < 0 && mgoIdx < 0) {
    throw new OilMonsterParseError('Could not find VLSFO or MGO columns in OilMonster HTML');
  }

  const results: OilMonsterEntry[] = [];

  // Scan all <tr> elements; thead rows contain <th> not <td> so they're harmless
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(flat)) !== null) {
    const rowHtml = rowMatch[1];

    const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const tds: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
      tds.push(tdMatch[1]);
    }

    if (tds.length < 2) continue;

    // Port name is the text content of the link in the first cell
    const portNameMatch = />([^<]+)</.exec(tds[0]);
    if (!portNameMatch) continue;
    const portName = portNameMatch[1].trim();

    const unlocode = PORT_MAP.get(portName);
    if (!unlocode) continue;

    const entry: OilMonsterEntry = { portName, unlocode };
    if (vlsfoIdx >= 0 && vlsfoIdx < tds.length) entry.vlsfo = parseTdValue(tds[vlsfoIdx]);
    if (mgoIdx >= 0 && mgoIdx < tds.length) entry.mgo = parseTdValue(tds[mgoIdx]);

    if (entry.vlsfo !== undefined || entry.mgo !== undefined) {
      results.push(entry);
    }
  }

  return results;
}

/**
 * Parses a single per-port VLSFO page from oilmonster.com.
 *
 * Anchors on `class="scrapitemprice"` for the current price, skipping the
 * arrow icon via non-greedy match. Price date is extracted from the
 * "Price Date :" label in the page header. The history table (spprice/sphead
 * classes) is NOT read — the scrapitemprice anchor is the only price source.
 */
export function parseOilMonsterPortHtml(html: string): { vlsfo: number; priceDate: string } {
  if (!html.includes('scrapitemprice') || !html.includes('$US/MT')) {
    throw new OilMonsterStructureChangedError(
      'per-port page missing scrapitemprice or $US/MT anchor',
    );
  }

  // Current price: first number immediately before <span>$US/MT inside the scrapitemprice div.
  // The non-greedy [\s\S]*? skips the <i> arrow icon that precedes the number.
  const priceMatch = /class="scrapitemprice"[\s\S]*?>([\d,]+\.\d{2})<span>\$US\/MT/.exec(html);
  if (!priceMatch) {
    throw new OilMonsterStructureChangedError(
      'scrapitemprice div present but price not found before $US/MT',
    );
  }

  const priceStr = priceMatch[1].replace(/,/g, '');
  const vlsfo = parseFloat(priceStr);
  if (!Number.isFinite(vlsfo) || vlsfo <= 0) {
    throw new OilMonsterParseError(`non-numeric price in per-port page: ${priceMatch[1]}`);
  }

  const dateMatch = /Price Date\s*:\s*<span[^>]*>\s*(\d{4}-\d{2}-\d{2})/.exec(html);
  if (!dateMatch) {
    throw new OilMonsterStructureChangedError('price date not found in per-port page');
  }

  return { vlsfo, priceDate: dateMatch[1] };
}

/**
 * Fetch oilmonster.com main page, parse VLSFO+MGO for all target ports, upsert to DB.
 * Additionally fetches per-port pages for Istanbul (TRIST) and Piraeus (GRPIR).
 * Derives Constanta (ROCND) as Istanbul + BLACK_SEA_PREMIUM_USD (source=oilmonster-proxy).
 *
 * Per-port errors are isolated — one failing port does not abort the run.
 * Staleness guard skips per-port prices older than MAX_AGE_DAYS.
 * Throws if zero rows are written (cron marks the source as failed).
 */
export async function refreshOilMonster(
  db: Database.Database,
  fetcher: HtmlFetcher = defaultFetcher,
  opts: { now?: Date } = {},
): Promise<{ rowsChanged: number }> {
  const now = opts.now ?? new Date();
  const fetchedAt = now.toISOString();

  const raw = await fetcher(OILMONSTER_URL);

  let entries: OilMonsterEntry[];
  try {
    entries = parseOilMonsterHtml(raw);
  } catch (e) {
    if (e instanceof OilMonsterParseError) {
      console.warn(`[OilMonster] ${e.message}`);
      entries = [];
    } else {
      throw e;
    }
  }

  if (entries.length === 0) {
    console.warn('[OilMonster] No target port rows found — page structure may have changed');
  }

  let rowsChanged = 0;

  const upsert = db.transaction(() => {
    for (const entry of entries) {
      if (entry.vlsfo !== undefined) {
        if (entry.vlsfo < RANGE_VLSFO.min || entry.vlsfo > RANGE_VLSFO.max) {
          const last = getLatestBunkerPrice(db, entry.unlocode, 'VLSFO');
          console.warn(
            `[OilMonster] ${entry.portName} VLSFO ${entry.vlsfo} out of range ` +
            `[${RANGE_VLSFO.min}–${RANGE_VLSFO.max}] — keeping last-good ` +
            `(${last?.price_usd_per_mt ?? 'none'})`,
          );
        } else {
          upsertBunkerPrice(db, {
            port_unlocode: entry.unlocode,
            fuel_grade: 'VLSFO',
            price_usd_per_mt: entry.vlsfo,
            price_date: now.toISOString().slice(0, 10),
            source: 'oilmonster',
            fetched_at: fetchedAt,
          });
          rowsChanged++;
        }
      }

      if (entry.mgo !== undefined) {
        if (entry.mgo < RANGE_MGO.min || entry.mgo > RANGE_MGO.max) {
          const last = getLatestBunkerPrice(db, entry.unlocode, 'MGO');
          console.warn(
            `[OilMonster] ${entry.portName} MGO ${entry.mgo} out of range ` +
            `[${RANGE_MGO.min}–${RANGE_MGO.max}] — keeping last-good ` +
            `(${last?.price_usd_per_mt ?? 'none'})`,
          );
        } else {
          upsertBunkerPrice(db, {
            port_unlocode: entry.unlocode,
            fuel_grade: 'MGO',
            price_usd_per_mt: entry.mgo,
            price_date: now.toISOString().slice(0, 10),
            source: 'oilmonster',
            fetched_at: fetchedAt,
          });
          rowsChanged++;
        }
      }
    }
  });
  upsert();

  // Per-port pages for East-Med ports
  let istanbulResult: { vlsfo: number; priceDate: string } | null = null;

  for (const [unlocode, url] of PER_PORT_URLS) {
    try {
      const html = await fetcher(url);
      const parsed = parseOilMonsterPortHtml(html);

      const ageDays = (now.getTime() - new Date(parsed.priceDate).getTime()) / 86_400_000;
      if (ageDays > MAX_AGE_DAYS) {
        console.warn(
          `[OilMonster] ${unlocode} price date ${parsed.priceDate} is stale ` +
          `(${Math.round(ageDays)}d > ${MAX_AGE_DAYS}d limit) — skipping`,
        );
        continue;
      }

      upsertBunkerPrice(db, {
        port_unlocode: unlocode,
        fuel_grade: 'VLSFO',
        price_usd_per_mt: parsed.vlsfo,
        price_date: parsed.priceDate,
        source: 'oilmonster',
        fetched_at: fetchedAt,
      });
      rowsChanged++;

      if (unlocode === 'TRIST') istanbulResult = parsed;
    } catch (e) {
      console.warn(`[OilMonster] ${unlocode} per-port error: ${(e as Error).message}`);
    }
  }

  // Constanta proxy: derive from Istanbul if fresh
  if (istanbulResult !== null) {
    const rocndPrice = Math.round((istanbulResult.vlsfo + BLACK_SEA_PREMIUM_USD) * 100) / 100;
    upsertBunkerPrice(db, {
      port_unlocode: 'ROCND',
      fuel_grade: 'VLSFO',
      price_usd_per_mt: rocndPrice,
      price_date: istanbulResult.priceDate,
      source: 'oilmonster-proxy',
      fetched_at: fetchedAt,
    });
    rowsChanged++;
  }

  if (rowsChanged === 0) {
    throw new Error('[OilMonster] zero rows written — all sources failed or returned stale data');
  }

  return { rowsChanged };
}

async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OilMonster fetch failed: ${res.status} ${url}`);
  return res.text();
}
