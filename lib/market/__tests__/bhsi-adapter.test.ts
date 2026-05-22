/**
 * Behavioral tests for lib/market/bhsi-adapter.ts
 *
 * PI2: calls parseBhsiHtml() with real HTML input (not string-match only).
 * Uses fixture HTML that mirrors the expected handybulk.com table structure.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import migration027 from '@/lib/migrations/027-market-indices';
import { parseBhsiHtml, refreshBhsi, HandybulkStructureChangedError } from '../bhsi-adapter';
import { getLatestIndex } from '../market-indices-repository';

const FIXTURE_HTML = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'handybulk-bhsi.html'),
  'utf-8',
);

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration027.up(db);
  return db;
}

describe('parseBhsiHtml', () => {
  it('parses BHSI value from fixture HTML (PI2: real parser call)', () => {
    const result = parseBhsiHtml(FIXTURE_HTML);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(530);
  });

  it('parses date from DD/MM/YYYY format', () => {
    const result = parseBhsiHtml(FIXTURE_HTML);
    expect(result!.date).toBe('2026-05-22');
  });

  it('returns null for empty HTML (boundary: empty)', () => {
    expect(parseBhsiHtml('')).toBeNull();
  });

  it('returns null when BHSI row is missing (boundary: structure changed)', () => {
    const html = '<html><body><table><tr><td>BDI</td><td>1234</td></tr></table></body></html>';
    expect(parseBhsiHtml(html)).toBeNull();
  });

  it('returns null for negative value (boundary: negative)', () => {
    const html =
      '<table><tr><td>BHSI</td><td>-100</td><td>22/05/2026</td></tr></table>';
    expect(parseBhsiHtml(html)).toBeNull();
  });

  it('parses comma-formatted value', () => {
    const html =
      '<table><tr><td>BHSI</td><td>1,234</td><td>22/05/2026</td></tr></table>';
    const result = parseBhsiHtml(html);
    expect(result!.value).toBe(1234);
  });

  it('falls back to today when date column absent', () => {
    const html = '<table><tr><td>BHSI</td><td>530</td></tr></table>';
    const result = parseBhsiHtml(html);
    expect(result).not.toBeNull();
    expect(result!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('refreshBhsi (PI2: real DB upsert)', () => {
  it('upserts BHSI row into market_indices', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML);

    await refreshBhsi(db, fakeFetcher);

    const row = getLatestIndex(db, 'bhsi');
    expect(row).not.toBeNull();
    expect(row!.value).toBe(530);
    expect(row!.index_date).toBe('2026-05-22');
    expect(row!.unit).toBe('USD/day');
    expect(row!.source).toContain('handybulk');

    db.close();
  });

  it('is idempotent — second call does not create duplicate', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML);

    await refreshBhsi(db, fakeFetcher);
    await refreshBhsi(db, fakeFetcher);

    const count = (
      db.prepare("SELECT COUNT(*) as n FROM market_indices WHERE index_name='bhsi'").get() as { n: number }
    ).n;
    expect(count).toBe(1);

    db.close();
  });

  it('throws HandybulkStructureChangedError when HTML has no BHSI row', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue('<html><body>no data</body></html>');

    await expect(refreshBhsi(db, fakeFetcher)).rejects.toThrow(
      HandybulkStructureChangedError,
    );

    db.close();
  });

  it('propagates network errors', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(refreshBhsi(db, fakeFetcher)).rejects.toThrow('Network error');

    db.close();
  });
});
