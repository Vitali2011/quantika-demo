import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { upsertIndex, type MarketIndexRow } from './market-indices-repository';

const INDEX_FILES: Record<string, { file: string; unit: string }> = {
  bhsi: { file: 'bhsi-snapshots.csv', unit: 'USD/day' },
  tmi: { file: 'toepfer-tmi-snapshots.csv', unit: 'USD/day' },
  'drewry-bb': { file: 'drewry-breakbulk-snapshots.csv', unit: 'USD/FEU' },
};

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'lib', 'sample-data', 'market');

export interface CsvLoadResult {
  loaded: number;
  skipped: number;
}

/**
 * Parses CSV content into MarketIndexRow records.
 * Expected format: date,value,unit,source_url (header required).
 * Silently skips malformed rows (bad date, non-finite/negative value).
 */
export function parseMarketCsv(csvContent: string, indexName: string): MarketIndexRow[] {
  const lines = csvContent
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const dataLines = lines.slice(1); // skip header
  const defaultUnit = INDEX_FILES[indexName]?.unit ?? 'USD/day';
  const now = new Date().toISOString();
  const rows: MarketIndexRow[] = [];

  for (const line of dataLines) {
    const parts = line.split(',');
    if (parts.length < 2) continue;

    const date = parts[0]?.trim() ?? '';
    const valueStr = parts[1]?.trim() ?? '';
    const unit = parts[2]?.trim() || defaultUnit;
    const sourceUrl = parts[3]?.trim() || 'csv-import';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const value = parseFloat(valueStr.replace(/,/g, ''));
    if (!Number.isFinite(value) || value < 0) continue;

    rows.push({
      id: `${indexName}-${date}`,
      index_name: indexName,
      index_date: date,
      value,
      unit,
      source: sourceUrl || 'csv-import',
      fetched_at: now,
    });
  }

  return rows;
}

/**
 * Boot-time CSV fallback loader.
 * Reads CSV files from dataDir and upserts into market_indices.
 * Skips entirely if market_indices already contains any rows.
 */
export function loadMarketCsvFiles(
  db: Database.Database,
  dataDir: string = DEFAULT_DATA_DIR,
): CsvLoadResult {
  const existing = (
    db.prepare('SELECT COUNT(*) as n FROM market_indices').get() as { n: number }
  ).n;

  if (existing > 0) {
    return { loaded: 0, skipped: existing };
  }

  let loaded = 0;

  for (const [indexName, { file }] of Object.entries(INDEX_FILES)) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const rows = parseMarketCsv(content, indexName);

    for (const row of rows) {
      upsertIndex(db, row);
      loaded++;
    }
  }

  return { loaded, skipped: 0 };
}
