import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import {
  refreshBunkerIndex,
  parseBunkerIndexHtml,
  BunkerIndexParseError,
} from '@/lib/knowledge/bunker/bunkerindex-adapter';
import { getLatestBunkerPrice, upsertBunkerPrice } from '@/lib/market/bunker-repository';
import { registerSource } from '@/lib/knowledge/governance';

const FIXTURES_DIR = join(__dirname, '../../../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration023.up(db);
  registerSource(db, {
    slug: 'bunker-bunkerindex',
    name: 'BunkerIndex Prices',
    kind: 'structured_rows',
    category: 'market',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 1,
  });
  return db;
}

// ---------------------------------------------------------------------------
// parseBunkerIndexHtml
// ---------------------------------------------------------------------------

describe('parseBunkerIndexHtml', () => {
  it('parses 3 target ports from fixture HTML', () => {
    const html = loadFixture('bunkerindex-prices.html');
    const entries = parseBunkerIndexHtml(html);
    const portNames = entries.map(e => e.portName);
    expect(portNames).toContain('Rotterdam');
    expect(portNames).toContain('Singapore');
    expect(portNames).toContain('Fujairah');
    expect(entries).toHaveLength(3);
  });

  it('does NOT include Houston or Gibraltar (out-of-scope)', () => {
    const html = loadFixture('bunkerindex-prices.html');
    const entries = parseBunkerIndexHtml(html);
    const portNames = entries.map(e => e.portName);
    expect(portNames).not.toContain('Houston');
    expect(portNames).not.toContain('Gibraltar');
  });

  it('parses correct UNLOCODE for each port', () => {
    const html = loadFixture('bunkerindex-prices.html');
    const entries = parseBunkerIndexHtml(html);
    const rtm = entries.find(e => e.portName === 'Rotterdam');
    expect(rtm?.unlocode).toBe('NLRTM');
    const sgp = entries.find(e => e.portName === 'Singapore');
    expect(sgp?.unlocode).toBe('SGSIN');
    const fjr = entries.find(e => e.portName === 'Fujairah');
    expect(fjr?.unlocode).toBe('AEFJR');
  });

  it('parses VLSFO and MGO prices for Rotterdam', () => {
    const html = loadFixture('bunkerindex-prices.html');
    const entries = parseBunkerIndexHtml(html);
    const rtm = entries.find(e => e.portName === 'Rotterdam');
    expect(rtm?.vlsfo).toBeCloseTo(529.0, 1);
    expect(rtm?.mgo).toBeCloseTo(731.0, 1);
  });

  it('throws BunkerIndexParseError on completely broken HTML', () => {
    const html = '<html><body><p>maintenance</p></body></html>';
    expect(() => parseBunkerIndexHtml(html)).toThrow(BunkerIndexParseError);
  });
});

// ---------------------------------------------------------------------------
// refreshBunkerIndex
// ---------------------------------------------------------------------------

describe('refreshBunkerIndex', () => {
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

  it('upserts VLSFO and MGO for 3 ports from fixture (6 rows)', async () => {
    const fetcher = jest.fn().mockResolvedValue(loadFixture('bunkerindex-prices.html'));
    const result = await refreshBunkerIndex(db, fetcher);
    expect(result.rowsChanged).toBe(6); // 3 ports × 2 grades
  });

  it('stores correct prices for NLRTM VLSFO and MGO', async () => {
    const fetcher = jest.fn().mockResolvedValue(loadFixture('bunkerindex-prices.html'));
    await refreshBunkerIndex(db, fetcher);

    const vlsfo = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO');
    expect(vlsfo).not.toBeNull();
    expect(vlsfo!.price_usd_per_mt).toBeCloseTo(529.0, 1);
    expect(vlsfo!.source).toBe('bunkerindex');

    const mgo = getLatestBunkerPrice(db, 'NLRTM', 'MGO');
    expect(mgo).not.toBeNull();
    expect(mgo!.price_usd_per_mt).toBeCloseTo(731.0, 1);
  });

  it('Houston (USHOU) NOT updated by bunkerindex source', async () => {
    const fetcher = jest.fn().mockResolvedValue(loadFixture('bunkerindex-prices.html'));
    await refreshBunkerIndex(db, fetcher);

    // Houston may have seeded data, but source must never be 'bunkerindex'
    const row = db.prepare(
      "SELECT * FROM bunker_prices WHERE port_unlocode='USHOU' AND source='bunkerindex'"
    ).get();
    expect(row).toBeUndefined();
  });

  it('Gibraltar (GIGIB) NOT updated by bunkerindex source', async () => {
    const fetcher = jest.fn().mockResolvedValue(loadFixture('bunkerindex-prices.html'));
    await refreshBunkerIndex(db, fetcher);

    const row = db.prepare(
      "SELECT * FROM bunker_prices WHERE port_unlocode='GIGIB' AND source='bunkerindex'"
    ).get();
    expect(row).toBeUndefined();
  });

  it('VLSFO out-of-range (too low) → not written, last-good preserved', async () => {
    // Seed a valid price first
    upsertBunkerPrice(db, {
      port_unlocode: 'NLRTM',
      fuel_grade: 'VLSFO',
      price_usd_per_mt: 520.0,
      price_date: '2026-05-30',
      source: 'shipandbunker',
      fetched_at: new Date().toISOString(),
    });

    const outOfRangeHtml = loadFixture('bunkerindex-prices.html').replace(
      /data-grade="VLSFO"[^>]*>529\.00/,
      'data-grade="VLSFO">100.00' // below 300 min
    );
    const fetcher = jest.fn().mockResolvedValue(outOfRangeHtml);
    await refreshBunkerIndex(db, fetcher);

    const row = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO');
    expect(row!.price_usd_per_mt).toBeCloseTo(520.0, 1); // unchanged
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out of range'));
  });

  it('MGO out-of-range (too high) → not written by bunkerindex, warn logged', async () => {
    const outOfRangeHtml = loadFixture('bunkerindex-prices.html').replace(
      /data-grade="MGO"[^>]*>731\.00/,
      'data-grade="MGO">9999.00' // above 2000 max
    );
    const fetcher = jest.fn().mockResolvedValue(outOfRangeHtml);
    const result = await refreshBunkerIndex(db, fetcher);

    // source='bunkerindex' MGO for NLRTM must not exist (out-of-range skipped)
    const mgo = db.prepare(
      "SELECT * FROM bunker_prices WHERE port_unlocode='NLRTM' AND fuel_grade='MGO' AND source='bunkerindex'"
    ).get();
    expect(mgo).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out of range'));
    // Other ports/grades still processed
    expect(result.rowsChanged).toBeGreaterThan(0);
  });

  it('returns rowsChanged=0 on broken HTML (graceful)', async () => {
    const fetcher = jest.fn().mockResolvedValue('<html><body>maintenance</body></html>');
    const result = await refreshBunkerIndex(db, fetcher);
    expect(result.rowsChanged).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('propagates network errors (fetch throws)', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(refreshBunkerIndex(db, fetcher)).rejects.toThrow('ECONNREFUSED');
  });
});
