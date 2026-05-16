/**
 * TDD tests for lib/market/manual-csv-loader.ts
 *
 * parseMarketCsv: pure CSV→DB-row parser (no FS, no DB)
 * loadMarketCsvFiles: reads CSV files from disk → upserts into market_indices
 *
 * 9-class boundary coverage:
 * 1. Empty   — empty content, header-only, zero rows
 * 2. NaN/Inf — non-numeric value field
 * 3. Negative — negative value
 * 4. Range   — very large value (no overflow expected)
 * 5. Switch  — unknown indexName passed through cleanly
 * 6. Substring — index_name stored exactly as given (no leak)
 * 7. Config  — missing source_url falls back to 'csv-import'
 * 8. PI2     — id format is `${indexName}-${date}` (not string-match)
 * 9. E2E     — loadMarketCsvFiles skips when DB already has data
 */

import Database from 'better-sqlite3';
import migration027 from '@/lib/migrations/027-market-indices';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Loaded after implementation exists — will fail at import until impl created (RED)
import { parseMarketCsv, loadMarketCsvFiles } from '../manual-csv-loader';
import { getIndexHistory } from '../market-indices-repository';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration027.up(db);
  return db;
}

function rowCount(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) as n FROM market_indices').get() as { n: number }).n;
}

// ---------------------------------------------------------------------------
// parseMarketCsv
// ---------------------------------------------------------------------------
describe('parseMarketCsv', () => {
  it('returns empty array for empty string (boundary: empty)', () => {
    expect(parseMarketCsv('', 'bhsi')).toEqual([]);
  });

  it('returns empty array for header-only CSV (boundary: empty)', () => {
    expect(parseMarketCsv('date,value,unit,source_url', 'bhsi')).toEqual([]);
  });

  it('returns empty array for whitespace-only content (boundary: empty)', () => {
    expect(parseMarketCsv('   \n  \n  ', 'bhsi')).toEqual([]);
  });

  it('parses single valid row', () => {
    const csv = `date,value,unit,source_url
2026-05-09,1245,USD/day,https://example.com`;
    const rows = parseMarketCsv(csv, 'bhsi');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'bhsi-2026-05-09',
      index_name: 'bhsi',
      index_date: '2026-05-09',
      value: 1245,
      unit: 'USD/day',
      source: 'https://example.com',
    });
    expect(typeof rows[0].fetched_at).toBe('string');
  });

  it('parses multiple rows', () => {
    const csv = `date,value,unit,source_url
2026-05-09,1245,USD/day,https://example.com
2026-05-02,1198,USD/day,https://example.com`;
    const rows = parseMarketCsv(csv, 'bhsi');
    expect(rows).toHaveLength(2);
    expect(rows[0].index_date).toBe('2026-05-09');
    expect(rows[1].index_date).toBe('2026-05-02');
  });

  it('skips rows with non-numeric value (boundary: NaN)', () => {
    const csv = `date,value,unit,source_url
2026-05-09,abc,USD/day,https://example.com`;
    expect(parseMarketCsv(csv, 'bhsi')).toHaveLength(0);
  });

  it('skips rows with negative value (boundary: negative)', () => {
    const csv = `date,value,unit,source_url
2026-05-09,-100,USD/day,https://example.com`;
    expect(parseMarketCsv(csv, 'bhsi')).toHaveLength(0);
  });

  it('accepts very large value (boundary: range, no overflow)', () => {
    const csv = `date,value,unit,source_url
2026-05-09,9999999,USD/day,https://example.com`;
    const rows = parseMarketCsv(csv, 'bhsi');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(9999999);
  });

  it('skips rows with invalid date format (boundary: malformed)', () => {
    const csv = `date,value,unit,source_url
26-05-09,1245,USD/day,https://example.com
not-a-date,1245,USD/day,https://example.com`;
    expect(parseMarketCsv(csv, 'bhsi')).toHaveLength(0);
  });

  it('falls back to csv-import when source_url missing (boundary: config)', () => {
    const csv = `date,value,unit,source_url
2026-05-09,1245,USD/day,`;
    const rows = parseMarketCsv(csv, 'bhsi');
    expect(rows[0].source).toBe('csv-import');
  });

  it('stores index_name exactly as given — no substring mutation (boundary: substring)', () => {
    const csv = `date,value,unit,source_url
2026-05-09,1245,USD/day,https://example.com`;
    const rows = parseMarketCsv(csv, 'drewry-bb');
    expect(rows[0].index_name).toBe('drewry-bb');
    expect(rows[0].id).toBe('drewry-bb-2026-05-09');
  });

  it('generates correct id format (PI2: not a string-match)', () => {
    const csv = `date,value,unit,source_url
2026-05-09,700,USD/day,https://example.com`;
    const rows = parseMarketCsv(csv, 'tmi');
    // id must be indexName + '-' + date (no ambiguity)
    expect(rows[0].id).toBe('tmi-2026-05-09');
  });
});

// ---------------------------------------------------------------------------
// loadMarketCsvFiles
// ---------------------------------------------------------------------------
describe('loadMarketCsvFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns loaded=0 skipped=count when DB already has data (boundary: E2E skip)', () => {
    const db = makeDb();
    // Pre-seed one row
    db.prepare(`
      INSERT INTO market_indices (id, index_name, index_date, value, unit, source, fetched_at)
      VALUES ('bhsi-2026-05-01', 'bhsi', '2026-05-01', 400, 'USD/day', 'test', datetime('now'))
    `).run();

    const result = loadMarketCsvFiles(db, tmpDir);
    expect(result.loaded).toBe(0);
    expect(result.skipped).toBe(1);
    db.close();
  });

  it('loads rows from CSV files when DB is empty (boundary: E2E)', () => {
    const db = makeDb();
    // Write CSV for BHSI
    fs.writeFileSync(
      path.join(tmpDir, 'bhsi-snapshots.csv'),
      `date,value,unit,source_url
2026-05-09,1245,USD/day,https://example.com
2026-05-02,1198,USD/day,https://example.com`,
    );

    const result = loadMarketCsvFiles(db, tmpDir);
    expect(result.loaded).toBe(2);
    expect(result.skipped).toBe(0);

    const rows = getIndexHistory(db, 'bhsi', 10);
    expect(rows).toHaveLength(2);
    db.close();
  });

  it('loads multiple index files in one call', () => {
    const db = makeDb();
    fs.writeFileSync(
      path.join(tmpDir, 'bhsi-snapshots.csv'),
      `date,value,unit,source_url\n2026-05-09,1245,USD/day,https://example.com`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'toepfer-tmi-snapshots.csv'),
      `date,value,unit,source_url\n2026-05-07,700,USD/day,https://example.com`,
    );

    const result = loadMarketCsvFiles(db, tmpDir);
    expect(result.loaded).toBe(2);

    const bhsi = getIndexHistory(db, 'bhsi', 5);
    const tmi = getIndexHistory(db, 'tmi', 5);
    expect(bhsi).toHaveLength(1);
    expect(tmi).toHaveLength(1);
    db.close();
  });

  it('is idempotent — second call with same data does not duplicate rows', () => {
    const db = makeDb();
    const csv = `date,value,unit,source_url\n2026-05-09,1245,USD/day,https://example.com`;
    fs.writeFileSync(path.join(tmpDir, 'bhsi-snapshots.csv'), csv);

    loadMarketCsvFiles(db, tmpDir);
    // Second call: DB not empty → skip
    const result2 = loadMarketCsvFiles(db, tmpDir);
    expect(result2.loaded).toBe(0);
    expect(result2.skipped).toBe(1);
    expect(rowCount(db)).toBe(1);
    db.close();
  });

  it('skips missing CSV files gracefully (boundary: partial)', () => {
    const db = makeDb();
    // Only BHSI file exists, no TMI or drewry-bb
    fs.writeFileSync(
      path.join(tmpDir, 'bhsi-snapshots.csv'),
      `date,value,unit,source_url\n2026-05-09,1245,USD/day,https://example.com`,
    );

    const result = loadMarketCsvFiles(db, tmpDir);
    expect(result.loaded).toBe(1);
    db.close();
  });

  it('returns loaded=0 when all CSV files are empty headers (boundary: empty)', () => {
    const db = makeDb();
    fs.writeFileSync(path.join(tmpDir, 'bhsi-snapshots.csv'), 'date,value,unit,source_url');
    fs.writeFileSync(path.join(tmpDir, 'toepfer-tmi-snapshots.csv'), 'date,value,unit,source_url');

    const result = loadMarketCsvFiles(db, tmpDir);
    expect(result.loaded).toBe(0);
    expect(rowCount(db)).toBe(0);
    db.close();
  });
});
