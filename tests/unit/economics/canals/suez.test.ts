/**
 * TDD tests for Suez SCNT calculator
 *
 * Input Contract:
 *   vesselNt, vesselDwt must be finite > 0  → RangeError
 *   daysInHra < 0 clamp to 0               → warRiskUsd = 0
 *   vesselType: 'bulker'|'tanker'|'container'|'general' — TypeScript enum
 */

import Database from 'better-sqlite3';
import { _setCanalDb } from '@/lib/economics/canals/db';
import { quoteSuez } from '@/lib/economics/canals/suez';
import {
  CANAL_TARIFFS_SCHEMA,
  SUEZ_BASE_SEED,
  makeTestDb,
  type SeedRow,
} from '../../../helpers/canal-db';
import scaFixtures from '../../../fixtures/sca-reference-cases.json';

let mainDb: Database.Database;

beforeAll(() => {
  mainDb = makeTestDb(SUEZ_BASE_SEED);
  _setCanalDb(mainDb);
});

afterAll(() => {
  _setCanalDb(null);
  mainDb.close();
});

// ── SCA Reference Cases ──────────────────────────────────────────────────────

describe('SCA reference cases', () => {
  it('Case A: 70k DWT bulker laden → scnt=36750, tier=4, totalUsd within ±2%', () => {
    const { input, expected } = scaFixtures[0];
    const result = quoteSuez(input as Parameters<typeof quoteSuez>[0]);
    expect(result.scnt).toBe(expected.scnt);
    expect(result.tier).toBe(expected.tier);
    expect(Math.abs(result.totalUsd - expected.totalUsd) / expected.totalUsd).toBeLessThanOrEqual(0.02);
  });

  it('Case B: 105k DWT tanker ballast → scnt=60500, tier=4, warRiskUsd=0, totalUsd within ±2%', () => {
    const { input, expected } = scaFixtures[1];
    const result = quoteSuez(input as Parameters<typeof quoteSuez>[0]);
    expect(result.scnt).toBe(expected.scnt);
    expect(result.tier).toBe(expected.tier);
    expect(result.warRiskUsd).toBe(0);
    expect(Math.abs(result.totalUsd - expected.totalUsd) / expected.totalUsd).toBeLessThanOrEqual(0.02);
  });
});

// ── War Risk Integration ─────────────────────────────────────────────────────

describe('war risk integration', () => {
  let warDb: Database.Database;

  beforeAll(() => {
    // Seed with war_risk_zone set on bulker tier-4 row
    const seed: SeedRow[] = SUEZ_BASE_SEED.map(row =>
      row.canal === 'suez' && row.vessel_type === 'bulker' && row.scnt_min === 20001
        ? { ...row, war_risk_zone: 'red-sea-hra' }
        : row
    );
    warDb = makeTestDb(seed);
    _setCanalDb(warDb);
  });

  afterAll(() => {
    warDb.close();
    _setCanalDb(mainDb); // restore main DB
  });

  it('war_risk_zone=red-sea-hra + vesselValueUsd + daysInHra → warRiskUsd > 0', () => {
    const result = quoteSuez({
      vesselDwt: 70000,
      vesselNt: 35000,
      vesselType: 'bulker',
      laden: true,
      vesselValueUsd: 20_000_000,
      daysInHra: 2,
    });
    expect(result.warRiskUsd).toBeGreaterThan(0);
    // audit C.8: totalUsd no longer folds war-risk in (was: totalUsd > baseFee + scntFee).
    // warRiskUsd is informational-only; totalUsd = SCNT dues.
    expect(result.totalUsd).toBe(result.scntFeeUsd);
  });

  it('reports warRiskUsd separately, never inside totalUsd (audit C.8 latent double-count)', () => {
    const q = quoteSuez({ vesselDwt: 50000, vesselNt: 32500, vesselType: 'bulker', laden: true,
      vesselValueUsd: 15_000_000, daysInHra: 5 });
    expect(q.warRiskUsd).toBeGreaterThan(0); // war-risk still quoted for visibility
    expect(q.totalUsd).toBe(q.scntFeeUsd);
  });

  it('war_risk_zone set but daysInHra=0 → warRiskUsd === 0', () => {
    const result = quoteSuez({
      vesselDwt: 70000,
      vesselNt: 35000,
      vesselType: 'bulker',
      laden: true,
      vesselValueUsd: 20_000_000,
      daysInHra: 0,
    });
    expect(result.warRiskUsd).toBe(0);
  });
});

// ── Input Contract Boundary Tests ────────────────────────────────────────────

describe('input validation', () => {
  it('rejects vesselNt=0 with RangeError', () => {
    expect(() => quoteSuez({ vesselDwt: 70000, vesselNt: 0, vesselType: 'bulker', laden: true }))
      .toThrow(RangeError);
  });

  it('rejects vesselNt=NaN with RangeError', () => {
    expect(() => quoteSuez({ vesselDwt: 70000, vesselNt: NaN, vesselType: 'bulker', laden: true }))
      .toThrow(RangeError);
  });

  it('rejects vesselNt=-1 with RangeError', () => {
    expect(() => quoteSuez({ vesselDwt: 70000, vesselNt: -1, vesselType: 'bulker', laden: true }))
      .toThrow(RangeError);
  });

  it('rejects vesselDwt=Infinity with RangeError', () => {
    expect(() => quoteSuez({ vesselDwt: Infinity, vesselNt: 35000, vesselType: 'bulker', laden: true }))
      .toThrow(RangeError);
  });

  it('rejects vesselDwt=0 with RangeError', () => {
    expect(() => quoteSuez({ vesselDwt: 0, vesselNt: 35000, vesselType: 'bulker', laden: true }))
      .toThrow(RangeError);
  });
});

// ── Tier boundary checks ─────────────────────────────────────────────────────

describe('tier determination', () => {
  it('SCNT≈2500 → tier 1', () => {
    // NT=2381 → SCNT = 2381 × 1.05 = 2500.05 → tier 1 (≤5000)
    const result = quoteSuez({ vesselDwt: 5000, vesselNt: 2381, vesselType: 'bulker', laden: true });
    expect(result.tier).toBe(1);
  });

  it('SCNT≈75000 → tier 5', () => {
    // NT=71429 → SCNT = 71429 × 1.05 = 75000.45 → tier 5 (>70000)
    const result = quoteSuez({ vesselDwt: 140000, vesselNt: 71429, vesselType: 'bulker', laden: true });
    expect(result.tier).toBe(5);
  });
});
