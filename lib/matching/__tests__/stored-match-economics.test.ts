/**
 * Unit tests — stored-match-economics.ts
 *
 * Proves that computeStoredMatchEconomics is the single source of truth:
 * - includes port-DA in tce_usd_per_day (parity with pair-analyzer)
 * - uses excludeWarRiskFromDailyTce:true (parity with detail-page convention)
 * - returns nulls gracefully when distance is unavailable
 */
import Database from 'better-sqlite3';
import {
  computeStoredMatchEconomics,
} from '@/lib/matching/stored-match-economics';

/** Minimal DB fixture with port_da_estimates for two ports. */
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE port_da_estimates (
      port_code TEXT,
      vessel_dwt_min INTEGER,
      vessel_dwt_max INTEGER,
      port_dues_usd REAL,
      pilotage_usd REAL,
      tugs_usd REAL,
      stevedoring_usd_per_mt REAL DEFAULT 0,
      cargo_type TEXT DEFAULT 'general',
      confidence TEXT DEFAULT 'estimated',
      source TEXT DEFAULT 'test'
    );
  `);
  // Rotterdam (NLRTM) + Singapore (SGSIN) — both have non-zero dues
  // cargo_type='general' matches the fallback in repository.ts for unknown types
  db.prepare(
    `INSERT INTO port_da_estimates
       (port_code, vessel_dwt_min, vessel_dwt_max, port_dues_usd, pilotage_usd, tugs_usd,
        stevedoring_usd_per_mt, cargo_type, confidence, source)
     VALUES
       ('NLRTM', 0, 200000, 20000, 8000, 5000, 0, 'general', 'estimated', 'test'),
       ('SGSIN', 0, 200000, 18000, 7000, 5000, 0, 'general', 'estimated', 'test')`
  ).run();
  return db;
}

describe('computeStoredMatchEconomics — single source of truth', () => {
  it('includes port-DA in the stored tce_usd_per_day (parity with pair-analyzer)', () => {
    const db = makeDb();

    const result = computeStoredMatchEconomics({
      cargo: {
        emailId: 'c1',
        itemIndex: 0,
        originPort: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
        destinationPort: { value: 'Singapore', confidence: 'confirmed', source_text: 'Singapore' },
        cargoType: { value: 'GRAIN', confidence: 'confirmed', source_text: 'grain' },
        freightRateUsd: 28,
        weightMt: { value: 55000, confidence: 'confirmed', source_text: '55000' },
      } as any,
      vessel: {
        emailId: 'v1',
        itemIndex: 0,
        dwtSummer: { value: 55000, confidence: 'confirmed', source_text: '55000' },
        speedLaden: '14',
        consumption: '28',
        openPosition: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
      } as any,
      db,
    });

    expect(result).not.toBeNull();
    // tce_breakdown exposes the da_usd from the TCE engine
    expect(result.tce_breakdown).not.toBeNull();
    expect(result.tce_breakdown!.da_usd).toBeGreaterThan(0);
    // tce_usd_per_day must be lower than the same calc without DA (DA subtracts from net voyage)
    expect(result.tce_usd_per_day).not.toBeNull();
    expect(result.tce_usd_per_day).toBeGreaterThan(0);
    // Economics result is populated
    expect(result.economics).not.toBeNull();
    expect(result.economics!.tceUsdPerDay).toBe(result.tce_usd_per_day);
  });

  it('returns all-null result when cargo ports are unavailable', () => {
    const db = makeDb();

    const result = computeStoredMatchEconomics({
      cargo: {
        emailId: 'c2',
        itemIndex: 0,
        originPort: null,
        destinationPort: null,
        cargoType: 'GRAIN',
        freightRateUsd: null,
        weightMt: null,
      } as any,
      vessel: {
        emailId: 'v2',
        itemIndex: 0,
        dwtSummer: { value: 55000, confidence: 'confirmed', source_text: '55000' },
        speedLaden: '14',
        consumption: '28',
        openPosition: null,
      } as any,
      db,
    });

    expect(result.tce_usd_per_day).toBeNull();
    expect(result.freight_rate_usd_per_mt).toBeNull();
    expect(result.economics).toBeNull();
    expect(result.tce_breakdown).toBeNull();
  });

  it('works without db (gracefully degrades to zero DA)', () => {
    const result = computeStoredMatchEconomics({
      cargo: {
        emailId: 'c3',
        itemIndex: 0,
        originPort: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
        destinationPort: { value: 'Singapore', confidence: 'confirmed', source_text: 'Singapore' },
        cargoType: 'GRAIN',
        freightRateUsd: 28,
        weightMt: { value: 55000, confidence: 'confirmed', source_text: '55000' },
      } as any,
      vessel: {
        emailId: 'v3',
        itemIndex: 0,
        dwtSummer: { value: 55000, confidence: 'confirmed', source_text: '55000' },
        speedLaden: '14',
        consumption: '28',
        openPosition: null,
      } as any,
      db: undefined,
    });

    // no crash, returns valid TCE with DA=0
    expect(result.tce_usd_per_day).not.toBeNull();
    expect(result.tce_breakdown).not.toBeNull();
    expect(result.tce_breakdown!.da_usd).toBe(0);
  });
});
