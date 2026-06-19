/**
 * fx-rate.ts — single sourced EUR→USD for voyage economics (audit finding 14).
 *
 * Covers:
 *  - as-of-date resolution + 'live' tier
 *  - demo-frozen-date determinism (clock mocked → stable across calls / wall-clock)
 *  - 'estimated' fallback when the FX feed is unavailable
 *  - all three EU-cost call-sites read the SAME injected rate (no private literal)
 */
import Database from 'better-sqlite3';

// Freeze the clock so the as-of date is deterministic (mirrors DEMO_MODE behaviour).
const mockToday = jest.fn<string, []>(() => '2026-05-28');
jest.mock('@/lib/clock', () => ({
  today: () => mockToday(),
  now: () => new Date('2026-05-28T00:00:00.000Z'),
  demoNow: () => new Date('2026-05-28T12:00:00.000Z').getTime(),
}));

import { getEurToUsd } from '../fx-rate-source';
import { EUR_USD_FALLBACK } from '../fx-rate';
import { computeBunkerComparison } from '../bunker-comparison';
import { calculateFuelEu } from '../fueleu';
import { computeTce, type TceInputs } from '../compute-tce';

function buildFxDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE fx_rates (
      base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL,
      rate REAL NOT NULL, rate_date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'frankfurter', fetched_at TEXT NOT NULL,
      PRIMARY KEY (base_currency, quote_currency, rate_date)
    );
  `);
  return db;
}

function seedRate(db: Database.Database, rate: number, rateDate: string): void {
  db.prepare(
    `INSERT INTO fx_rates (base_currency, quote_currency, rate, rate_date, source, fetched_at)
     VALUES ('EUR','USD',?,?,'frankfurter','2026-05-28T00:00:00Z')`,
  ).run(rate, rateDate);
}

beforeEach(() => {
  mockToday.mockReturnValue('2026-05-28');
});

describe('getEurToUsd', () => {
  it('returns the latest rate as-of the clock date, tier=live (ignores future-dated rows)', () => {
    const db = buildFxDb();
    seedRate(db, 1.1, '2026-05-01');
    seedRate(db, 1.16, '2026-05-25'); // latest <= frozen 2026-05-28
    seedRate(db, 1.2, '2026-06-10'); // future vs frozen — must be ignored

    const result = getEurToUsd(db);
    expect(result.rate).toBe(1.16);
    expect(result.tier).toBe('live');
    expect(result.rateDate).toBe('2026-05-25');
    // Real EUR/USD (~1.16) — materially above the old hardcoded 1.08.
    expect(result.rate).toBeGreaterThan(EUR_USD_FALLBACK);
  });

  it('is deterministic under the frozen clock — repeated calls return the same row', () => {
    const db = buildFxDb();
    seedRate(db, 1.16, '2026-05-25');

    const a = getEurToUsd(db);
    const b = getEurToUsd(db);
    expect(a).toEqual(b);
    expect(a.rateDate).toBe('2026-05-25');

    // A different frozen date would resolve a different as-of row — proving the
    // rate tracks the clock (frozen in demo) rather than wall-clock drift.
    seedRate(db, 1.1, '2026-04-10');
    mockToday.mockReturnValue('2026-04-15');
    expect(getEurToUsd(db).rate).toBe(1.1);
  });

  it('falls back to EUR_USD_FALLBACK with tier=estimated when no rate is available', () => {
    const db = buildFxDb(); // empty fx_rates
    const result = getEurToUsd(db);
    expect(result.rate).toBe(EUR_USD_FALLBACK);
    expect(result.tier).toBe('estimated');
    expect(result.rateDate).toBeNull();
  });

  it('falls back to estimated on DB error (missing table)', () => {
    const db = new Database(':memory:'); // no fx_rates table
    const result = getEurToUsd(db);
    expect(result.rate).toBe(EUR_USD_FALLBACK);
    expect(result.tier).toBe('estimated');
  });
});

describe('single source of truth — all EU-cost call-sites read the injected rate', () => {
  const INJECTED = 2.16; // exactly 2× EUR_USD_FALLBACK → ratios are clean

  it('bunker-comparison carbonCostUsd scales with eurToUsdRate (default = EUR_USD_FALLBACK)', () => {
    const base = {
      candidates: [{ port: 'NLRTM', grade: 'vlsfo', priceUsdPerMt: 600, deviationNm: 0 }],
      vesselSpeedKn: 14,
      dailyConsMtPerDay: 30,
      liftTonnes: 2000,
      vesselDayRateUsd: 20000,
      euaPriceEur: 80,
    };
    const dflt = computeBunkerComparison(base)[0]!;
    const injected = computeBunkerComparison({ ...base, eurToUsdRate: INJECTED })[0]!;

    expect(dflt.carbonCostUsd).toBeGreaterThan(0);
    // default path must use the single EUR_USD_FALLBACK constant (1.08), not a private literal
    expect(injected.carbonCostUsd / dflt.carbonCostUsd).toBeCloseTo(INJECTED / EUR_USD_FALLBACK, 4);
  });

  it('fueleu penaltyUsd scales with eurToUsdRate (default = EUR_USD_FALLBACK)', () => {
    const base = { fuelType: 'vlsfo', consumptionMtPerDay: 50, voyageDays: 30, year: 2025 };
    const dflt = calculateFuelEu(base);
    const injected = calculateFuelEu({ ...base, eurToUsdRate: INJECTED });

    expect(dflt.penaltyEur).toBeGreaterThan(0);
    expect(dflt.penaltyUsd).toBeCloseTo(dflt.penaltyEur * EUR_USD_FALLBACK, 4);
    expect(injected.penaltyUsd / dflt.penaltyUsd).toBeCloseTo(INJECTED / EUR_USD_FALLBACK, 4);
  });

  it('compute-tce ets_usd scales with eurToUsdRate (default = EUR_USD_FALLBACK)', () => {
    const base: TceInputs = {
      dwt: 50000,
      valueUsd: 25_000_000,
      speedKts: 14,
      consumptionMtPerDay: 30,
      freightRateUsdPerMt: 25,
      quantityMt: 45000,
      distanceNm: 4000,
      bunkerPriceUsdPerMt: 600,
      euaPriceEur: 80,
      canalUsd: 0,
      daUsd: 0,
      euLegPercent: 1,
      originEu: true,
      destEu: true,
    };
    const dflt = computeTce(base);
    const injected = computeTce({ ...base, eurToUsdRate: INJECTED });

    expect(dflt.breakdown.ets_eur).toBeGreaterThan(0);
    expect(dflt.breakdown.ets_usd).toBeGreaterThan(0);
    expect(dflt.breakdown.ets_usd).toBeCloseTo(dflt.breakdown.ets_eur * EUR_USD_FALLBACK, 0);
    expect(injected.breakdown.ets_usd / dflt.breakdown.ets_usd).toBeCloseTo(
      INJECTED / EUR_USD_FALLBACK,
      2,
    );
  });
});
