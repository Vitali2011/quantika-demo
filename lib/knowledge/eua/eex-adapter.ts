import type Database from 'better-sqlite3';
import { inflateRawSync } from 'node:zlib';
import { upsertEuaPrice } from '@/lib/market/eua-repository';

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

export type Fetcher = (url: string) => Promise<Buffer>;

// ---------------------------------------------------------------------------
// XLSX URL builder
// ---------------------------------------------------------------------------

/**
 * Returns the direct URL for the EEX EUA Primary Market Auction XLSX for a
 * given year (defaults to current UTC year).
 */
export function buildEexXlsxUrl(year?: number): string {
  const y = year ?? new Date().getUTCFullYear();
  return `https://public.eex-group.com/eex/eua-auction-report/emission-spot-primary-market-auction-report-${y}-data.xlsx`;
}

// ---------------------------------------------------------------------------
// Minimal XLSX parser (ZIP + XML, no extra dependencies)
// ---------------------------------------------------------------------------

function readZipEntry(buf: Buffer, targetName: string): Buffer {
  let pos = 0;
  while (pos < buf.length - 30) {
    // Local file header signature: PK\x03\x04
    if (buf.readUInt32LE(pos) !== 0x04034b50) {
      pos++;
      continue;
    }
    const compression = buf.readUInt16LE(pos + 8);
    const compressedSize = buf.readUInt32LE(pos + 18);
    const filenameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const filename = buf.subarray(pos + 30, pos + 30 + filenameLen).toString('utf8');
    const dataStart = pos + 30 + filenameLen + extraLen;

    if (filename === targetName) {
      const compressed = buf.subarray(dataStart, dataStart + compressedSize);
      if (compression === 0) return compressed; // stored
      if (compression === 8) return inflateRawSync(compressed); // deflate
      throw new EexCsvFormatError(`EEX XLSX: unsupported compression ${compression}`);
    }

    pos = dataStart + compressedSize;
  }
  throw new EexCsvFormatError(`EEX XLSX: '${targetName}' not found in archive`);
}

function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  const SI_RE = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = SI_RE.exec(xml)) !== null) {
    const texts = m[1].match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) ?? [];
    result.push(texts.map((t) => t.replace(/<[^>]+>/g, '')).join(''));
  }
  return result;
}

function parseCells(rowXml: string, strings: string[]): Record<string, string> {
  const cells: Record<string, string> = {};
  const CELL_RE = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
  let m: RegExpExecArray | null;
  while ((m = CELL_RE.exec(rowXml)) !== null) {
    const col = m[1];
    const attrs = m[2];
    const content = m[3];
    const isStr = /\bt="s"/.test(attrs);
    const valMatch = /<v>([^<]*)<\/v>/.exec(content);
    const val = valMatch?.[1] ?? '';
    cells[col] = isStr ? (strings[parseInt(val)] ?? '') : val;
  }
  return cells;
}

function excelDateToIso(serial: number): string {
  // Excel epoch: Dec 30, 1899 (Lotus 1-2-3 compatibility)
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * Parse an EEX Primary Market Auction XLSX buffer.
 * Finds the most recent EU-wide auction (row whose Auction Name contains "CAP3 EU")
 * and returns its clearing price and date.
 */
export function parseEexXlsx(buf: Buffer): { price: number; priceDate: string } {
  const sheetXml = readZipEntry(buf, 'xl/worksheets/sheet1.xml').toString('utf8');
  const ssXml = readZipEntry(buf, 'xl/sharedStrings.xml').toString('utf8');
  const strings = parseSharedStrings(ssXml);

  const ROW_RE = /<row\s[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;

  let dateCol = '';
  let nameCol = '';
  let priceCol = '';
  let headerFound = false;
  const euRows: { serial: number; price: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = ROW_RE.exec(sheetXml)) !== null) {
    const cells = parseCells(m[2], strings);

    if (!headerFound) {
      const entries = Object.entries(cells);
      const hasDate = entries.some(([, v]) => v === 'Date');
      const hasPriceCol = entries.some(([, v]) => /^Auction Price/i.test(v));
      if (hasDate && hasPriceCol) {
        dateCol = entries.find(([, v]) => v === 'Date')?.[0] ?? '';
        nameCol = entries.find(([, v]) => v === 'Auction Name')?.[0] ?? '';
        priceCol = entries.find(([, v]) => /^Auction Price/i.test(v))?.[0] ?? '';
        headerFound = true;
      }
      continue;
    }

    if (!dateCol || !priceCol) continue;

    const name = cells[nameCol] ?? '';
    if (!name.includes('CAP3 EU')) continue;

    const serial = parseFloat(cells[dateCol] ?? '');
    const price = parseFloat(cells[priceCol] ?? '');
    if (!Number.isFinite(serial) || !Number.isFinite(price)) continue;

    euRows.push({ serial, price });
  }

  if (euRows.length === 0) {
    throw new EexNoAuctionFoundError(
      'No EU CAP3 auction rows found in EEX XLSX — file structure may have changed',
    );
  }

  euRows.sort((a, b) => b.serial - a.serial);
  const { serial, price } = euRows[0];
  return { price, priceDate: excelDateToIso(serial) };
}

// ---------------------------------------------------------------------------
// Legacy CSV parser — kept for backward compatibility with unit tests
// ---------------------------------------------------------------------------

/**
 * Parse EEX auction CSV and extract the clearing price.
 */
export function parseEexCsv(csv: string): { price: number; priceDate: string } {
  const lines = csv
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new EexCsvFormatError('EEX CSV has fewer than 2 lines (header + data)');
  }

  const header = lines[0].split(',');
  const clearingPriceIdx = header.findIndex((col) => /Auction Clearing Price/i.test(col));
  if (clearingPriceIdx === -1) {
    throw new EexCsvFormatError(
      `EEX CSV missing "Auction Clearing Price" column. Headers: ${header.join(', ')}`,
    );
  }

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

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

/**
 * Download current-year EEX XLSX, parse the latest EU auction clearing price,
 * upsert into DB.
 */
export async function refreshEex(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher,
): Promise<{ rowsChanged: number; priceDate: string; price: number }> {
  const url = buildEexXlsxUrl();
  const buf = await fetcher(url);
  const { price, priceDate } = parseEexXlsx(buf);

  upsertEuaPrice(db, {
    price_date: priceDate,
    price_eur_per_tco2: price,
    contract_type: 'spot',
    source: 'eex-auction',
    fetched_at: new Date().toISOString(),
  });

  return { rowsChanged: 1, priceDate, price };
}

async function defaultFetcher(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Quantika-Demo/1.0' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`EEX fetch failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
