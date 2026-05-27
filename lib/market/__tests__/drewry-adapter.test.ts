/**
 * Behavioral tests for lib/market/drewry-adapter.ts
 *
 * PI2: calls parseWciHtml() with real HTML input (not string-match only).
 * Uses fixture HTML that mirrors the expected Drewry WCI page structure.
 * Unit: USD/FEU (WCI measures rates per 40ft container — FEU).
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import migration027 from '@/lib/migrations/027-market-indices';
import { parseWciHtml, refreshDrewryWci, DrewryStructureChangedError } from '../drewry-adapter';
import { getLatestIndex } from '../market-indices-repository';

const FIXTURE_HTML = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'drewry-wci.html'),
  'utf-8',
);

// Current page structure (2026-05+): WCI value embedded in bullet text
const FIXTURE_HTML_CURRENT = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'drewry-wci-2026-05-21.html'),
  'utf-8',
);

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration027.up(db);
  return db;
}

describe('parseWciHtml', () => {
  it('parses WCI composite value from fixture HTML (PI2: real parser call)', () => {
    const result = parseWciHtml(FIXTURE_HTML);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(2365);
  });

  it('parses "DD Month YYYY" date format', () => {
    const result = parseWciHtml(FIXTURE_HTML);
    expect(result!.date).toBe('2026-05-15');
  });

  it('returns null for empty HTML (boundary: empty)', () => {
    expect(parseWciHtml('')).toBeNull();
  });

  it('returns null when Composite value is absent (boundary: structure changed)', () => {
    const html = '<html><body><p>No WCI data available</p></body></html>';
    expect(parseWciHtml(html)).toBeNull();
  });

  it('parses comma-formatted value', () => {
    const html =
      '<div>Composite</div><div>$3,456</div><div>10 March 2026</div>';
    const result = parseWciHtml(html);
    expect(result!.value).toBe(3456);
  });

  it('falls back to today when no date found', () => {
    const html = '<p>Composite</p><p>$2,000</p>';
    const result = parseWciHtml(html);
    expect(result).not.toBeNull();
    expect(result!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('refreshDrewryWci (PI2: real DB upsert)', () => {
  it('upserts drewry-bb row with USD/FEU unit', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML);

    await refreshDrewryWci(db, fakeFetcher);

    const row = getLatestIndex(db, 'drewry-bb');
    expect(row).not.toBeNull();
    expect(row!.value).toBe(2365);
    expect(row!.index_date).toBe('2026-05-15');
    expect(row!.unit).toBe('USD/FEU');
    expect(row!.source).toContain('drewry');

    db.close();
  });

  it('is idempotent — second call does not create duplicate', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML);

    await refreshDrewryWci(db, fakeFetcher);
    await refreshDrewryWci(db, fakeFetcher);

    const count = (
      db
        .prepare("SELECT COUNT(*) as n FROM market_indices WHERE index_name='drewry-bb'")
        .get() as { n: number }
    ).n;
    expect(count).toBe(1);

    db.close();
  });

  it('throws DrewryStructureChangedError when HTML has no Composite value', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue('<html><body>maintenance</body></html>');

    await expect(refreshDrewryWci(db, fakeFetcher)).rejects.toThrow(
      DrewryStructureChangedError,
    );

    db.close();
  });

  it('propagates network errors', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockRejectedValue(new Error('Connection refused'));

    await expect(refreshDrewryWci(db, fakeFetcher)).rejects.toThrow('Connection refused');

    db.close();
  });
});

// #582: Drewry changed page structure — value is now in bullet text, not a composite card
describe('parseWciHtml — current page structure (2026-05+)', () => {
  it('parses WCI value from bullet-text format (PI2: real parser call)', () => {
    const result = parseWciHtml(FIXTURE_HTML_CURRENT);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(2712);
  });

  it('parses date from "Thursday, 21 May 2026" heading', () => {
    const result = parseWciHtml(FIXTURE_HTML_CURRENT);
    expect(result!.date).toBe('2026-05-21');
  });

  it('ignores first WCI mention (no dollar value nearby) and picks the correct bullet value', () => {
    // The new HTML has two "World Container Index (WCI)" occurrences:
    // 1st: "WCI has been the go-to..." — no $ within 200 chars
    // 2nd: "WCI increased 6% to $2,712" — should be matched
    const result = parseWciHtml(FIXTURE_HTML_CURRENT);
    expect(result!.value).toBe(2712);
  });
});

describe('refreshDrewryWci — current page structure (PI2: real DB upsert)', () => {
  it('upserts drewry-bb row from current page structure with correct value and date', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML_CURRENT);

    await refreshDrewryWci(db, fakeFetcher);

    const row = getLatestIndex(db, 'drewry-bb');
    expect(row).not.toBeNull();
    expect(row!.value).toBe(2712);
    expect(row!.index_date).toBe('2026-05-21');
    expect(row!.unit).toBe('USD/FEU');

    db.close();
  });
});
