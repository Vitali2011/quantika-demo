import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import {
  refreshTradingEconomics,
  parseTradingEconomicsHtml,
  TradingEconomicsParseError,
} from '@/lib/knowledge/eua/tradingeconomics-adapter';
import { getLatestEuaPrice, upsertEuaPrice } from '@/lib/market/eua-repository';
import { registerSource } from '@/lib/knowledge/governance';

const FIXTURES_DIR = join(__dirname, '../../../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration024.up(db);
  registerSource(db, {
    slug: 'eua-tradingeconomics',
    name: 'TradingEconomics EU Carbon',
    kind: 'structured_rows',
    category: 'market',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 1,
  });
  return db;
}

// ---------------------------------------------------------------------------
// parseTradingEconomicsHtml
// ---------------------------------------------------------------------------

describe('parseTradingEconomicsHtml', () => {
  it('extracts price from JSON script tag (strategy 1)', () => {
    const html = '<script>var te = {"Last":65.50,"Currency":"EUR"};</script>';
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBeCloseTo(65.5, 2);
  });

  it('extracts price from data-value attribute (strategy 2)', () => {
    const html = '<span data-value="72.35">72.35</span>';
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBeCloseTo(72.35, 2);
  });

  it('extracts price from id="last-price" element (strategy 3)', () => {
    const html = '<span id="last-price">58.90</span>';
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBeCloseTo(58.9, 2);
  });

  it('parses the fixture HTML and returns 65.50', () => {
    const html = loadFixture('tradingeconomics-carbon.html');
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBeCloseTo(65.5, 2);
  });

  it('throws TradingEconomicsParseError when no price found', () => {
    const html = '<html><body><p>Just a moment...</p></body></html>';
    expect(() => parseTradingEconomicsHtml(html)).toThrow(TradingEconomicsParseError);
  });

  it('priceDate is a valid YYYY-MM-DD', () => {
    const html = '<script>var te = {"Last":65.50};</script>';
    const { priceDate } = parseTradingEconomicsHtml(html);
    expect(priceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// refreshTradingEconomics
// ---------------------------------------------------------------------------

describe('refreshTradingEconomics', () => {
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

  it('fetches page and upserts price to DB', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      '<script>var te = {"Last":65.50};</script>'
    );
    const result = await refreshTradingEconomics(db, fetcher);
    expect(result).not.toBeNull();
    expect(result!.price).toBeCloseTo(65.5, 2);
    expect(result!.rowsChanged).toBe(1);

    const row = getLatestEuaPrice(db);
    expect(row).not.toBeNull();
    expect(row!.price_eur_per_tco2).toBeCloseTo(65.5, 2);
    expect(row!.source).toBe('tradingeconomics');
  });

  it('returns null and logs warn when price out of range (too low)', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      '<script>var te = {"Last":5.00};</script>'
    );
    const result = await refreshTradingEconomics(db, fetcher);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out of range'));
  });

  it('returns null and logs warn when price out of range (too high)', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      '<script>var te = {"Last":999.00};</script>'
    );
    const result = await refreshTradingEconomics(db, fetcher);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out of range'));
  });

  it('does NOT overwrite last-good price when out-of-range received', async () => {
    // Seed a valid price first
    upsertEuaPrice(db, {
      price_date: '2026-05-30',
      price_eur_per_tco2: 71.0,
      contract_type: 'spot',
      source: 'tradingeconomics',
      fetched_at: new Date().toISOString(),
    });

    const fetcher = jest.fn().mockResolvedValue(
      '<script>var te = {"Last":999.00};</script>'
    );
    await refreshTradingEconomics(db, fetcher);

    // Seed row is 2026-05-30 — older than EUA_STALE_DAYS vs the real clock, so we
    // bypass the freshness gate to assert the last-good row survived. This mirrors
    // the adapter's own last-good lookup, which calls with { maxAgeDays: Infinity }.
    const row = getLatestEuaPrice(db, 'spot', { maxAgeDays: Infinity });
    expect(row!.price_eur_per_tco2).toBeCloseTo(71.0, 2); // unchanged
  });

  it('returns null when HTML unparseable (Cloudflare/paywall)', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      '<!DOCTYPE html><html><body>Just a moment...</body></html>'
    );
    const result = await refreshTradingEconomics(db, fetcher);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[TE]'));
  });

  it('propagates network errors (fetch throws)', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(refreshTradingEconomics(db, fetcher)).rejects.toThrow('ECONNREFUSED');
  });

  it('uses fixture HTML end-to-end', async () => {
    const html = loadFixture('tradingeconomics-carbon.html');
    const fetcher = jest.fn().mockResolvedValue(html);
    const result = await refreshTradingEconomics(db, fetcher);
    expect(result).not.toBeNull();
    expect(result!.price).toBeCloseTo(65.5, 2);
  });
});
