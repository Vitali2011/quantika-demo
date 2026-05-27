/**
 * Behavioral tests for lib/market/bci-adapter.ts
 *
 * PI2: calls parseBciHtml() with real HTML input (not string-match only).
 * Uses the shared handybulk-bhsi.html fixture which includes BCI in daily paragraphs.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import { parseBciHtml, refreshBci, BciStructureChangedError } from '../bci-adapter';
import { getLatestBalticIndex } from '../baltic-repository';

const FIXTURE_HTML = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'handybulk-bhsi.html'),
  'utf-8',
);

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration019.up(db);
  return db;
}

describe('parseBciHtml', () => {
  it('parses BCI value from fixture HTML (PI2: real parser call)', () => {
    const result = parseBciHtml(FIXTURE_HTML);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(4954);
  });

  it('parses date from DD-Month-YYYY format', () => {
    const result = parseBciHtml(FIXTURE_HTML);
    expect(result!.date).toBe('2026-05-22');
  });

  it('returns null for empty HTML (boundary: empty)', () => {
    expect(parseBciHtml('')).toBeNull();
  });

  it('returns null when BCI row is missing (boundary: structure changed)', () => {
    const html = '<html><body><p>22-May-2026</p><p>The Baltic Dry Index (BDI) rose to 1,456 points.</p></body></html>';
    expect(parseBciHtml(html)).toBeNull();
  });

  it('parses comma-formatted value', () => {
    const html =
      '<p>The Baltic Capesize Index (BCI) increased by 50 points to 5,210 points.</p>';
    const result = parseBciHtml(html);
    expect(result!.value).toBe(5210);
  });

  it('falls back to today when no date entry precedes BCI value', () => {
    const html =
      '<p>The Baltic Capesize Index (BCI) decreased by 30 points to 4,900 points.</p>';
    const result = parseBciHtml(html);
    expect(result).not.toBeNull();
    expect(result!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('refreshBci (PI2: real DB upsert)', () => {
  it('upserts BCI row into baltic_indices', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML);

    await refreshBci(db, fakeFetcher);

    const row = getLatestBalticIndex(db, 'BCI');
    expect(row).not.toBeNull();
    expect(row!.value).toBe(4954);
    expect(row!.price_date).toBe('2026-05-22');
    expect(row!.index_code).toBe('BCI');
    expect(row!.source).toContain('handybulk');

    db.close();
  });

  it('is idempotent — second call does not duplicate', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML);

    await refreshBci(db, fakeFetcher);
    await refreshBci(db, fakeFetcher);

    const count = (
      db.prepare("SELECT COUNT(*) as n FROM baltic_indices WHERE index_code='BCI'").get() as { n: number }
    ).n;
    expect(count).toBe(1);

    db.close();
  });

  it('throws BciStructureChangedError when HTML has no BCI entry', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue('<html><body>no data</body></html>');

    await expect(refreshBci(db, fakeFetcher)).rejects.toThrow(BciStructureChangedError);

    db.close();
  });

  it('propagates network errors', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(refreshBci(db, fakeFetcher)).rejects.toThrow('Network error');

    db.close();
  });
});
