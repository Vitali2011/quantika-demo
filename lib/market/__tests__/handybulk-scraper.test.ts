/**
 * Behavioral tests for lib/market/handybulk-scraper.ts
 *
 * PI2: all tests call the real parser or the real refresh function with
 * injectable mock fetchers — no string-match-only assertions.
 *
 * Coverage (plan-required):
 * 1. parseHandybulkHtml — parses all 5 indices from first dated section
 * 2. parseTradingEconomicsHtml — parses 4 indices (no BHSI) from TE JSON
 * 3. Out-of-range value → not stored, last good preserved, console.warn
 * 4. HandyBulk throw → TE fallback fires
 * 5. HandyBulk returns 0 valid → TE fallback fires
 * 6. Both sources fail → no throw, old DB values intact, rowsChanged=0
 * 7. Upsert idempotent — same price_date twice creates no duplicates
 */

import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import migration027 from '@/lib/migrations/027-market-indices';
import {
  parseHandybulkHtml,
  parseTradingEconomicsHtml,
  refreshAllBalticIndices,
  RANGE_BOUNDS,
  HANDYBULK_URL,
  TE_COMMODITY_URL,
} from '../handybulk-scraper';
import { getLatestBalticIndex, upsertBalticIndex } from '../baltic-repository';
import { getLatestIndex } from '../market-indices-repository';

// ─── Mock HTML ────────────────────────────────────────────────────────────────

/** Full 5-index HandyBulk page — two dated sections; first is most recent. */
const HB_HTML = `<!DOCTYPE html>
<html><body>
<div class="entry-content">
  <p>28-May-2026</p>
  <div>
    <p>The Baltic Dry Index (BDI) increased by 27 points to reach 1,842 points.
    The Baltic Capesize Index (BCI) increased by 120 points to 4,954 points.
    The Baltic Supramax Index (BSI) decreased by 4 points to 962 points.
    The Baltic Handysize Index (BHSI) decreased by 3 points to 530 points.
    The Baltic Panamax Index (BPI) increased by 50 points to 3,456 points.</p>
  </div>
  <p>27-May-2026</p>
  <div>
    <p>The Baltic Dry Index (BDI) decreased by 41 points to 1,815 points.</p>
  </div>
</div>
</body></html>`;

/** BDI value is out of the valid range (99,999 > 15,000). */
const HB_HTML_OUT_OF_RANGE_BDI = `<!DOCTYPE html>
<html><body>
<div class="entry-content">
  <p>28-May-2026</p>
  <div>
    <p>The Baltic Dry Index (BDI) surged to 99,999 points.
    The Baltic Capesize Index (BCI) increased by 120 points to 4,954 points.
    The Baltic Supramax Index (BSI) decreased by 4 points to 962 points.
    The Baltic Handysize Index (BHSI) decreased by 3 points to 530 points.</p>
  </div>
</div>
</body></html>`;

/** Trading Economics page — BDI/BCI/BSI/BPI, no BHSI. */
const TE_HTML = `<html><body>
<script>
(function(){var te=[
  {"Symbol":"BDI","Last":1842,"Date":"2026-05-28"},
  {"Symbol":"BCI","Last":4954,"Date":"2026-05-28"},
  {"Symbol":"BSI","Last":962,"Date":"2026-05-28"},
  {"Symbol":"BPI","Last":3456,"Date":"2026-05-28"}
];}())
</script>
</body></html>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration019.up(db);
  migration027.up(db);
  return db;
}

// ─── parseHandybulkHtml ───────────────────────────────────────────────────────

describe('parseHandybulkHtml', () => {
  it('parses all 5 indices from the first dated section (PI2: real parser)', () => {
    const result = parseHandybulkHtml(HB_HTML);
    expect(result.BDI).toEqual({ value: 1842, price_date: '2026-05-28' });
    expect(result.BCI).toEqual({ value: 4954, price_date: '2026-05-28' });
    expect(result.BSI).toEqual({ value: 962,  price_date: '2026-05-28' });
    expect(result.BHSI).toEqual({ value: 530,  price_date: '2026-05-28' });
    expect(result.BPI).toEqual({ value: 3456, price_date: '2026-05-28' });
  });

  it('uses only the first (most-recent) dated section — ignores older entries', () => {
    const result = parseHandybulkHtml(HB_HTML);
    // First section: BDI=1842; second (older) section: BDI=1815
    expect(result.BDI?.value).toBe(1842);
    expect(result.BDI?.price_date).toBe('2026-05-28');
  });

  it('returns {} for empty HTML', () => {
    expect(parseHandybulkHtml('')).toEqual({});
  });

  it('returns partial result when some indices are absent', () => {
    const html = `<html><body>
<p>28-May-2026</p>
<p>The Baltic Dry Index (BDI) increased by 10 points to reach 1,842 points.</p>
</body></html>`;
    const result = parseHandybulkHtml(html);
    expect(result.BDI).toBeDefined();
    expect(result.BCI).toBeUndefined();
    expect(result.BPI).toBeUndefined();
  });

  it('parses comma-formatted values correctly', () => {
    const result = parseHandybulkHtml(HB_HTML);
    expect(result.BCI?.value).toBe(4954);
    expect(result.BPI?.value).toBe(3456);
  });
});

// ─── parseTradingEconomicsHtml ────────────────────────────────────────────────

describe('parseTradingEconomicsHtml', () => {
  it('parses BDI/BCI/BSI/BPI from TE JSON (PI2: real parser)', () => {
    const result = parseTradingEconomicsHtml(TE_HTML);
    expect(result.BDI).toEqual({ value: 1842, price_date: '2026-05-28' });
    expect(result.BCI).toEqual({ value: 4954, price_date: '2026-05-28' });
    expect(result.BSI).toEqual({ value: 962,  price_date: '2026-05-28' });
    expect(result.BPI).toEqual({ value: 3456, price_date: '2026-05-28' });
  });

  it('does not return BHSI (not available on TE Baltic page)', () => {
    const result = parseTradingEconomicsHtml(TE_HTML);
    expect(result.BHSI).toBeUndefined();
  });

  it('returns {} for empty HTML', () => {
    expect(parseTradingEconomicsHtml('')).toEqual({});
  });
});

// ─── refreshAllBalticIndices ──────────────────────────────────────────────────

describe('refreshAllBalticIndices', () => {
  let db: Database.Database;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    db = makeDb();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    db.close();
    warnSpy.mockRestore();
  });

  it('fetches HandyBulk once, upserts all 5 valid indices', async () => {
    const hbFetch = jest.fn().mockResolvedValue(HB_HTML);
    const teFetch = jest.fn();

    const r = await refreshAllBalticIndices(db, { hb: hbFetch, te: teFetch });

    expect(hbFetch).toHaveBeenCalledTimes(1);
    expect(hbFetch).toHaveBeenCalledWith(HANDYBULK_URL);
    expect(teFetch).not.toHaveBeenCalled();
    expect(r.rowsChanged).toBe(5);

    expect(getLatestBalticIndex(db, 'BDI')?.value).toBe(1842);
    expect(getLatestBalticIndex(db, 'BSI')?.value).toBe(962);
    expect(getLatestBalticIndex(db, 'BPI')?.value).toBe(3456);
  });

  it('also writes BHSI to market_indices (benchmark API compat)', async () => {
    const hbFetch = jest.fn().mockResolvedValue(HB_HTML);
    await refreshAllBalticIndices(db, { hb: hbFetch });

    const row = getLatestIndex(db, 'bhsi');
    expect(row?.value).toBe(530);
    expect(row?.index_date).toBe('2026-05-28');
    expect(row?.unit).toBe('USD/day');
  });

  it('out-of-range BDI not stored, last good value preserved, warns', async () => {
    upsertBalticIndex(db, { index_code: 'BDI', value: 1500, price_date: '2026-05-27', source: 'seed' });

    const hbFetch = jest.fn().mockResolvedValue(HB_HTML_OUT_OF_RANGE_BDI);
    await refreshAllBalticIndices(db, { hb: hbFetch });

    const bdi = getLatestBalticIndex(db, 'BDI');
    expect(bdi?.value).toBe(1500);
    expect(bdi?.price_date).toBe('2026-05-27');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('BDI=99999'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('out of range'),
    );

    // Other valid indices from the same HTML are still stored
    expect(getLatestBalticIndex(db, 'BCI')?.value).toBe(4954);
    expect(getLatestBalticIndex(db, 'BSI')?.value).toBe(962);
  });

  it('falls back to Trading Economics when HandyBulk throws', async () => {
    const hbFetch = jest.fn().mockRejectedValue(new Error('Network timeout'));
    const teFetch = jest.fn().mockResolvedValue(TE_HTML);

    const r = await refreshAllBalticIndices(db, { hb: hbFetch, te: teFetch });

    expect(teFetch).toHaveBeenCalledTimes(1);
    expect(teFetch).toHaveBeenCalledWith(TE_COMMODITY_URL);
    expect(r.rowsChanged).toBeGreaterThan(0);
    expect(getLatestBalticIndex(db, 'BDI')?.value).toBe(1842);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('HandyBulk unavailable'),
    );
  });

  it('falls back to TE when HandyBulk returns 0 valid (empty parse)', async () => {
    const hbFetch = jest.fn().mockResolvedValue('<html><body>no Baltic data here</body></html>');
    const teFetch = jest.fn().mockResolvedValue(TE_HTML);

    const r = await refreshAllBalticIndices(db, { hb: hbFetch, te: teFetch });

    expect(teFetch).toHaveBeenCalledTimes(1);
    expect(r.rowsChanged).toBeGreaterThan(0);
  });

  it('both sources fail — no throw, rowsChanged=0, old DB values intact', async () => {
    upsertBalticIndex(db, { index_code: 'BDI', value: 1500, price_date: '2026-05-27', source: 'seed' });

    const hbFetch = jest.fn().mockRejectedValue(new Error('HB down'));
    const teFetch = jest.fn().mockRejectedValue(new Error('TE down'));

    await expect(
      refreshAllBalticIndices(db, { hb: hbFetch, te: teFetch }),
    ).resolves.toEqual({ rowsChanged: 0 });

    expect(getLatestBalticIndex(db, 'BDI')?.value).toBe(1500);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('upsert is idempotent — same price_date twice creates no duplicate rows', async () => {
    const hbFetch = jest.fn().mockResolvedValue(HB_HTML);

    await refreshAllBalticIndices(db, { hb: hbFetch });
    await refreshAllBalticIndices(db, { hb: hbFetch });

    const n = (
      db
        .prepare("SELECT COUNT(*) as n FROM baltic_indices WHERE price_date='2026-05-28'")
        .get() as { n: number }
    ).n;
    expect(n).toBe(5);
  });

  it('RANGE_BOUNDS covers all 5 expected index codes', () => {
    expect(RANGE_BOUNDS).toMatchObject({
      BDI:  expect.any(Array),
      BCI:  expect.any(Array),
      BSI:  expect.any(Array),
      BHSI: expect.any(Array),
      BPI:  expect.any(Array),
    });
  });
});
