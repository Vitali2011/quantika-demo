/**
 * TDD tests for Panama Canal tariff calculator
 *
 * Input Contract (already defined in panama.ts:6-8):
 *   vesselNt, vesselDwt must be finite > 0  → RangeError
 *   vesselType: 'bulker'|'tanker'|'container'|'general' — TypeScript enum
 *   No active tariff found → Error
 *
 * Boundary Classes (spec-G1):
 *   - 0 DWT vessel → reject (RangeError)
 *   - 30K DWT bulker → cost matches 2025 ACP schedule
 *   - NaN/Infinity → reject (RangeError)
 */

import Database from 'better-sqlite3';
import { _setCanalDb } from '@/lib/economics/canals/db';
import { quotePanama } from '@/lib/economics/canals/panama';
import { makeTestDb, ALL_CANAL_SEED } from '../../../helpers/canal-db';

let db: Database.Database;

beforeAll(() => {
  // Start with current production seed (will fail with old values)
  db = makeTestDb(ALL_CANAL_SEED);
  _setCanalDb(db);
});

afterAll(() => {
  _setCanalDb(null);
  db.close();
});

// ── ACP 2025 Reference Cases ─────────────────────────────────────────────────

describe('ACP 2025-Q1 refreshed rates', () => {
  it('30K DWT bulker (NT≈15K) → totalUsd matches refreshed 2025-Q1 ACP schedule', () => {
    // 30K DWT bulker, NT≈15,000
    // Refreshed 2025-Q1 rates: base=16500, unit=1.65 (up from 15000/1.50)
    const result = quotePanama({ vesselDwt: 30000, vesselNt: 15000, vesselType: 'bulker' });
    const expected = 16500 + 15000 * 1.65; // base + NT * unit_fee
    expect(result.totalUsd).toBeCloseTo(expected, 2);
    expect(result.baseFeeUsd).toBe(16500);
    expect(result.unitFeeUsd).toBeCloseTo(24750, 2);
    expect(result.source).toMatch(/acp-2025/i);
  });

  it('100K DWT tanker (NT≈50K) → totalUsd matches refreshed 2025-Q1 ACP schedule', () => {
    // Refreshed 2025-Q1 rates: base=22000, unit=1.95 (up from 20000/1.80)
    const result = quotePanama({ vesselDwt: 100000, vesselNt: 50000, vesselType: 'tanker' });
    const expected = 22000 + 50000 * 1.95;
    expect(result.totalUsd).toBeCloseTo(expected, 2);
    expect(result.baseFeeUsd).toBe(22000);
    expect(result.source).toMatch(/acp-2025/i);
  });

  it('8K TEU container (NT≈60K) → totalUsd matches refreshed 2025-Q1 ACP schedule', () => {
    // Refreshed 2025-Q1 rates: base=27500, unit=2.75 (up from 25000/2.50)
    const result = quotePanama({ vesselDwt: 120000, vesselNt: 60000, vesselType: 'container' });
    const expected = 27500 + 60000 * 2.75;
    expect(result.totalUsd).toBeCloseTo(expected, 2);
    expect(result.baseFeeUsd).toBe(27500);
  });

  it('general cargo (NT≈10K) → totalUsd matches refreshed 2025-Q1 ACP schedule', () => {
    // Refreshed 2025-Q1 rates: base=13200, unit=1.32 (up from 12000/1.20)
    const result = quotePanama({ vesselDwt: 20000, vesselNt: 10000, vesselType: 'general' });
    const expected = 13200 + 10000 * 1.32;
    expect(result.totalUsd).toBeCloseTo(expected, 2);
    expect(result.baseFeeUsd).toBe(13200);
  });
});

// ── Input Contract Boundary Tests ────────────────────────────────────────────

describe('input validation', () => {
  it('rejects vesselNt=0 with RangeError', () => {
    expect(() => quotePanama({ vesselDwt: 30000, vesselNt: 0, vesselType: 'bulker' }))
      .toThrow(RangeError);
  });

  it('rejects vesselNt=NaN with RangeError', () => {
    expect(() => quotePanama({ vesselDwt: 30000, vesselNt: NaN, vesselType: 'bulker' }))
      .toThrow(RangeError);
  });

  it('rejects vesselNt=-1 with RangeError', () => {
    expect(() => quotePanama({ vesselDwt: 30000, vesselNt: -1, vesselType: 'bulker' }))
      .toThrow(RangeError);
  });

  it('rejects vesselDwt=Infinity with RangeError', () => {
    expect(() => quotePanama({ vesselDwt: Infinity, vesselNt: 15000, vesselType: 'bulker' }))
      .toThrow(RangeError);
  });

  it('rejects vesselDwt=0 with RangeError', () => {
    expect(() => quotePanama({ vesselDwt: 0, vesselNt: 15000, vesselType: 'bulker' }))
      .toThrow(RangeError);
  });

  it('rejects vesselDwt=-100 with RangeError', () => {
    expect(() => quotePanama({ vesselDwt: -100, vesselNt: 15000, vesselType: 'bulker' }))
      .toThrow(RangeError);
  });
});

// ── Return type structure ────────────────────────────────────────────────────

describe('return value shape', () => {
  it('result has baseFeeUsd, unitFeeUsd, warRiskUsd=0, totalUsd, source', () => {
    const result = quotePanama({ vesselDwt: 30000, vesselNt: 15000, vesselType: 'bulker' });
    expect(typeof result.baseFeeUsd).toBe('number');
    expect(typeof result.unitFeeUsd).toBe('number');
    expect(typeof result.warRiskUsd).toBe('number');
    expect(typeof result.totalUsd).toBe('number');
    expect(typeof result.source).toBe('string');
    expect(result.warRiskUsd).toBe(0); // Panama has no war risk premium
  });

  it('totalUsd = baseFeeUsd + unitFeeUsd (no war risk)', () => {
    const result = quotePanama({ vesselDwt: 30000, vesselNt: 15000, vesselType: 'bulker' });
    expect(result.totalUsd).toBeCloseTo(result.baseFeeUsd + result.unitFeeUsd, 2);
  });
});

// ── Edge cases from spec-G1 boundary inputs ──────────────────────────────────

describe('spec-G1 boundary cases', () => {
  it('very small vessel (1K DWT, NT=500) → valid positive cost', () => {
    const result = quotePanama({ vesselDwt: 1000, vesselNt: 500, vesselType: 'bulker' });
    expect(result.totalUsd).toBeGreaterThan(0);
    expect(result.totalUsd).toBeGreaterThan(result.baseFeeUsd); // has unit fee component
  });

  it('Neopanamax max (120K DWT, NT=60K) → valid cost', () => {
    const result = quotePanama({ vesselDwt: 120000, vesselNt: 60000, vesselType: 'bulker' });
    expect(result.totalUsd).toBeGreaterThan(0);
  });

  it('exceeds Neopanamax (200K DWT) → still calculates (no rejection logic)', () => {
    // Spec says "fall through to old behavior (or reject — design choice)"
    // Current implementation: calculates normally (no size limit)
    const result = quotePanama({ vesselDwt: 200000, vesselNt: 100000, vesselType: 'bulker' });
    expect(result.totalUsd).toBeGreaterThan(0);
  });
});
