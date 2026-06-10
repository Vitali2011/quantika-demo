import Database from 'better-sqlite3';
import { buildMatchQuoteContext, INDICATIVE_SPREAD_PCT } from '@/lib/quote-jobs/match-context';

// Mock getCurrentBenchmark to avoid network calls in tests
jest.mock('@/lib/market/benchmark', () => ({
  getCurrentBenchmark: jest.fn().mockResolvedValue(null),
}));

function buildMatchesDb(): { db: Database.Database; matchId: string } {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cargo_id TEXT NOT NULL DEFAULT '',
      vessel_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      tce_usd_per_day REAL,
      distance_nm REAL,
      freight_rate_usd_per_mt REAL,
      freight_rate_source TEXT,
      vessel_name TEXT,
      vessel_dwt REAL,
      load_port TEXT,
      discharge_port TEXT
    )
  `);
  const r = db.prepare(`
    INSERT INTO matches (vessel_name, vessel_dwt, load_port, discharge_port, tce_usd_per_day, freight_rate_usd_per_mt, freight_rate_source, distance_nm)
    VALUES (?,?,?,?,?,?,?,?)
  `).run('MV TEST VESSEL', 50000, 'Rotterdam', 'Singapore', 12450, 18.00, 'computed', 9000);
  return { db, matchId: String(r.lastInsertRowid) };
}

it('returns a block carrying ONLY the match numbers + a derived band', async () => {
  const { db, matchId } = buildMatchesDb();
  const ctx = await buildMatchQuoteContext(db, matchId);
  expect(ctx).not.toBeNull();
  expect(ctx!.block).toContain('MATCH ECONOMICS');
  expect(ctx!.offeredRate).toBeCloseTo(18.00, 2);
  expect(ctx!.marketLow).toBeCloseTo(18.00 * (1 - INDICATIVE_SPREAD_PCT), 2);
  expect(ctx!.marketHigh).toBeCloseTo(18.00 * (1 + INDICATIVE_SPREAD_PCT), 2);
  expect(ctx!.block).toContain('INDICATIVE');
  expect(ctx!.block).toMatch(/use only/i);
});

it('band math is exact at ±5%', async () => {
  const { db, matchId } = buildMatchesDb();
  const ctx = await buildMatchQuoteContext(db, matchId);
  expect(ctx!.marketLow).toBeCloseTo(18.00 * 0.95, 5);
  expect(ctx!.marketHigh).toBeCloseTo(18.00 * 1.05, 5);
  expect(ctx!.block).toContain('17.10');
  expect(ctx!.block).toContain('18.90');
});

it('returns null for an unknown match (caller falls back to the cargo path)', async () => {
  const { db } = buildMatchesDb();
  expect(await buildMatchQuoteContext(db, '999999')).toBeNull();
});

it('returns null for a non-numeric matchId', async () => {
  const { db } = buildMatchesDb();
  expect(await buildMatchQuoteContext(db, 'cargo-123-vessel-456')).toBeNull();
});

it('returns null when freight_rate_usd_per_mt is null', async () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cargo_id TEXT NOT NULL DEFAULT '',
      vessel_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      tce_usd_per_day REAL,
      distance_nm REAL,
      freight_rate_usd_per_mt REAL,
      freight_rate_source TEXT,
      vessel_name TEXT,
      vessel_dwt REAL,
      load_port TEXT,
      discharge_port TEXT
    )
  `);
  const r = db.prepare(`INSERT INTO matches (vessel_name) VALUES ('MV NO RATE')`).run();
  expect(await buildMatchQuoteContext(db, String(r.lastInsertRowid))).toBeNull();
});
