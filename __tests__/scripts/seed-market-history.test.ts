import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import migration027 from '@/lib/migrations/027-market-indices';
import {
  generateDates,
  generateSeries,
  makeLcg,
  seedMarketHistory,
} from '@/scripts/seed-market-history';

const FROZEN_DATE = '2026-05-28';
const DAYS = 30;

// ── Unit: generateDates ──────────────────────────────────────────────────────

describe('generateDates', () => {
  it('returns exactly `count` dates', () => {
    expect(generateDates(FROZEN_DATE, 30).length).toBe(30);
    expect(generateDates(FROZEN_DATE, 1).length).toBe(1);
  });

  it('last date is frozen_date', () => {
    const dates = generateDates(FROZEN_DATE, 30);
    expect(dates[dates.length - 1]).toBe(FROZEN_DATE);
  });

  it('all dates are <= frozen_date (constraint: no future dates in demo)', () => {
    const dates = generateDates(FROZEN_DATE, 30);
    expect(dates.every((d) => d <= FROZEN_DATE)).toBe(true);
  });

  it('dates are chronologically ascending', () => {
    const dates = generateDates(FROZEN_DATE, 10);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]! > dates[i - 1]!).toBe(true);
    }
  });
});

// ── Unit: makeLcg ────────────────────────────────────────────────────────────

describe('makeLcg', () => {
  it('produces values in [0, 1)', () => {
    const rng = makeLcg(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for same seed', () => {
    const r1 = makeLcg(42);
    const r2 = makeLcg(42);
    expect(r1()).toBe(r2());
    expect(r1()).toBe(r2());
  });

  it('differs for different seeds', () => {
    const r1 = makeLcg(1);
    const r2 = makeLcg(2);
    expect(r1()).not.toBe(r2());
  });
});

// ── Unit: generateSeries ─────────────────────────────────────────────────────

describe('generateSeries', () => {
  it('returns exactly `count` values', () => {
    expect(generateSeries(1000, 1200, 30, 20, 'BDI').length).toBe(30);
  });

  it('last value equals endValue', () => {
    const vals = generateSeries(1000, 1200, 30, 20, 'BDI');
    expect(vals[vals.length - 1]).toBe(1200);
  });

  it('is deterministic for same seedName', () => {
    const a = generateSeries(1000, 1200, 10, 20, 'BDI');
    const b = generateSeries(1000, 1200, 10, 20, 'BDI');
    expect(a).toEqual(b);
  });

  it('differs for different seedNames', () => {
    const a = generateSeries(1000, 1200, 10, 20, 'BDI');
    const b = generateSeries(1000, 1200, 10, 20, 'BCI');
    expect(a).not.toEqual(b);
  });

  it('all values are non-negative', () => {
    const vals = generateSeries(50, 100, 30, 10, 'EUA');
    expect(vals.every((v) => v >= 0)).toBe(true);
  });

  it('trending-down series ends lower than start (BHSI direction)', () => {
    const vals = generateSeries(980, 847, 30, 15, 'BHSI');
    expect(vals[vals.length - 1]!).toBeLessThan(vals[0]!);
  });
});

// ── Integration: seedMarketHistory ──────────────────────────────────────────

describe('seedMarketHistory', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migration019.up(db);
    migration023.up(db);
    migration024.up(db);
    migration027.up(db);
  });

  afterEach(() => db.close());

  it('inserts 30 rows per indicator into the correct tables', () => {
    seedMarketHistory(db, false);

    const baltic = db
      .prepare(`SELECT index_code, COUNT(*) as n FROM baltic_indices WHERE source = 'demo-seed' GROUP BY index_code`)
      .all() as { index_code: string; n: number }[];
    const balticMap = Object.fromEntries(baltic.map((r) => [r.index_code, r.n]));
    expect(balticMap['BDI']).toBe(DAYS);
    expect(balticMap['BCI']).toBe(DAYS);
    expect(balticMap['BSI']).toBe(DAYS);
    expect(balticMap['BHSI']).toBe(DAYS);

    const bunker = db
      .prepare(`SELECT fuel_grade, COUNT(*) as n FROM bunker_prices WHERE source = 'demo-seed' GROUP BY fuel_grade`)
      .all() as { fuel_grade: string; n: number }[];
    const bunkerMap = Object.fromEntries(bunker.map((r) => [r.fuel_grade, r.n]));
    expect(bunkerMap['VLSFO']).toBe(DAYS);
    expect(bunkerMap['MGO']).toBe(DAYS);

    const eua = db
      .prepare(`SELECT COUNT(*) as n FROM eua_prices WHERE source = 'demo-seed'`)
      .get() as { n: number };
    expect(eua.n).toBe(DAYS);
  });

  it('all seeded dates are <= frozen_date 2026-05-28', () => {
    seedMarketHistory(db, false);

    const badBaltic = db
      .prepare(`SELECT COUNT(*) as n FROM baltic_indices WHERE source = 'demo-seed' AND price_date > '2026-05-28'`)
      .get() as { n: number };
    expect(badBaltic.n).toBe(0);

    const badBunker = db
      .prepare(`SELECT COUNT(*) as n FROM bunker_prices WHERE source = 'demo-seed' AND price_date > '2026-05-28'`)
      .get() as { n: number };
    expect(badBunker.n).toBe(0);

    const badEua = db
      .prepare(`SELECT COUNT(*) as n FROM eua_prices WHERE source = 'demo-seed' AND price_date > '2026-05-28'`)
      .get() as { n: number };
    expect(badEua.n).toBe(0);
  });

  it('is idempotent — re-running produces the same row counts', () => {
    seedMarketHistory(db, false);
    seedMarketHistory(db, false);

    const n = db
      .prepare(`SELECT COUNT(*) as n FROM baltic_indices WHERE source = 'demo-seed' AND index_code = 'BDI'`)
      .get() as { n: number };
    expect(n.n).toBe(DAYS);
  });

  it('BDI last value trends toward target 3226', () => {
    seedMarketHistory(db, false);
    const row = db
      .prepare(`SELECT value FROM baltic_indices WHERE index_code = 'BDI' AND price_date = '2026-05-28' AND source = 'demo-seed'`)
      .get() as { value: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.value).toBe(3226);
  });

  it('EUA last value trends toward target 78.2', () => {
    seedMarketHistory(db, false);
    const row = db
      .prepare(`SELECT price_eur_per_tco2 FROM eua_prices WHERE price_date = '2026-05-28' AND source = 'demo-seed'`)
      .get() as { price_eur_per_tco2: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.price_eur_per_tco2).toBe(78.2);
  });

  it('dry mode writes nothing to DB', () => {
    seedMarketHistory(db, true);

    const n = db
      .prepare(`SELECT COUNT(*) as n FROM baltic_indices WHERE source = 'demo-seed'`)
      .get() as { n: number };
    expect(n.n).toBe(0);

    const m = db
      .prepare(`SELECT COUNT(*) as n FROM eua_prices WHERE source = 'demo-seed'`)
      .get() as { n: number };
    expect(m.n).toBe(0);
  });

  it('inserts 30 drewry-bb rows into market_indices', () => {
    seedMarketHistory(db, false);

    const row = db
      .prepare(`SELECT COUNT(*) as n FROM market_indices WHERE index_name = 'drewry-bb' AND source = 'demo-seed'`)
      .get() as { n: number };
    expect(row.n).toBe(DAYS);
  });

  it('drewry-bb last value on frozen_date equals 2800', () => {
    seedMarketHistory(db, false);

    const row = db
      .prepare(`SELECT value FROM market_indices WHERE index_name = 'drewry-bb' AND index_date = '2026-05-28' AND source = 'demo-seed'`)
      .get() as { value: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.value).toBe(2800);
  });

  it('drewry-bb all dates are <= frozen_date 2026-05-28', () => {
    seedMarketHistory(db, false);

    const bad = db
      .prepare(`SELECT COUNT(*) as n FROM market_indices WHERE index_name = 'drewry-bb' AND source = 'demo-seed' AND index_date > '2026-05-28'`)
      .get() as { n: number };
    expect(bad.n).toBe(0);
  });

  it('drewry-bb is idempotent — re-running produces same 30 rows', () => {
    seedMarketHistory(db, false);
    seedMarketHistory(db, false);

    const row = db
      .prepare(`SELECT COUNT(*) as n FROM market_indices WHERE index_name = 'drewry-bb' AND source = 'demo-seed'`)
      .get() as { n: number };
    expect(row.n).toBe(DAYS);
  });

  it('dry mode writes nothing to market_indices', () => {
    seedMarketHistory(db, true);

    const row = db
      .prepare(`SELECT COUNT(*) as n FROM market_indices WHERE source = 'demo-seed'`)
      .get() as { n: number };
    expect(row.n).toBe(0);
  });

  it('seedMarketHistory returns marketIndexRows = 30', () => {
    const result = seedMarketHistory(db, false);
    expect(result.marketIndexRows).toBe(DAYS);
  });
});
