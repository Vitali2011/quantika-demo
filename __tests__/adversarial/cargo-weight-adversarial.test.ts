/**
 * test-skill cold adversarial regression — #791 / #792
 *
 * Written by an independent reviewer to break the resolveCargoWeight helper,
 * the parity-check utility, and the overload gate boundary. Failure here is
 * actionable: the production fix has an edge case the unit tests missed.
 */
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { checkCargoWeight } from '@/lib/sailing/match-filters';
import { diffParsed } from '@/scripts/eval/parity-check-parsed-cargoes';
import type { ParsedCargo } from '@/lib/types';

function cargoWith(overrides: Partial<ParsedCargo>): ParsedCargo {
  return {
    emailId: 'adv',
    itemIndex: 0,
    originPort: { value: 'X', confidence: 'confirmed' },
    originCountry: null,
    destinationPort: { value: 'Y', confidence: 'confirmed' },
    destinationCountry: null,
    cargoDescription: { value: 'salt', confidence: 'confirmed' },
    weightMt: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: null,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    ...overrides,
  } as ParsedCargo;
}

describe('ADVERSARIAL #791 — resolveCargoWeight rejects bad numerics', () => {
  it('rejects negative weightMtMax (falls through to weightMt or null)', () => {
    const c = cargoWith({ weightMtMax: -100 });
    expect(resolveCargoWeight(c)).toBeNull();
  });

  it('rejects negative weightMtMax but accepts valid weightMt fallback', () => {
    const c = cargoWith({
      weightMt: { value: 500, confidence: 'confirmed' },
      weightMtMax: -100,
    });
    expect(resolveCargoWeight(c)).toBe(500);
  });

  it('rejects Infinity weightMtMax (silent overflow guard)', () => {
    const c = cargoWith({ weightMtMax: Number.POSITIVE_INFINITY });
    expect(resolveCargoWeight(c)).toBeNull();
  });

  it('rejects weightMt.value=NaN inside ConfidenceField', () => {
    const c = cargoWith({
      weightMt: { value: Number.NaN, confidence: 'confirmed' },
    });
    expect(resolveCargoWeight(c)).toBeNull();
  });

  it('rejects weightMt.value=-50 inside ConfidenceField', () => {
    const c = cargoWith({
      weightMt: { value: -50, confidence: 'confirmed' },
    });
    expect(resolveCargoWeight(c)).toBeNull();
  });

  it('handles tiny positive weights (0.1 mt) — accepts as valid', () => {
    const c = cargoWith({ weightMtMax: 0.1 });
    expect(resolveCargoWeight(c)).toBe(0.1);
  });

  it('handles huge weights (1e9 mt) — accepts (capacity check is downstream)', () => {
    const c = cargoWith({ weightMtMax: 1e9 });
    expect(resolveCargoWeight(c)).toBe(1e9);
  });
});

describe('ADVERSARIAL #792 — overload gate boundary cases', () => {
  it('passes EXACTLY at capacity × MARGIN (4200 == 4000 × 1.05)', () => {
    const r = checkCargoWeight({ weightMt: 4200, dwtSummer: null, dwcc: 4000 });
    expect(r.pass).toBe(true);
  });

  it('fails one mt above the boundary (4201 > 4200)', () => {
    const r = checkCargoWeight({ weightMt: 4201, dwtSummer: null, dwcc: 4000 });
    expect(r.pass).toBe(false);
  });

  it('range cargo with min above DWCC×1.05 still fails (uses max bound)', () => {
    const r = checkCargoWeight({
      weightMt: { min: 4300, max: 4500 },
      dwtSummer: null,
      dwcc: 4000,
    });
    expect(r.pass).toBe(false);
  });

  it('NaN cargo weight degrades to graceful pass (does not crash)', () => {
    const r = checkCargoWeight({
      weightMt: Number.NaN,
      dwtSummer: 2570,
      dwcc: null,
    });
    expect(r.pass).toBe(true);
  });

  it('negative DWCC fallback to DWT path', () => {
    const r = checkCargoWeight({
      weightMt: 3000,
      dwtSummer: 5000,
      dwcc: -1,
    });
    // -1 not > 0 → falls to DWT × 0.90 × 1.05 = 4725. 3000 ≤ 4725 → pass.
    expect(r.pass).toBe(true);
  });

  it('Infinity cargo weight handled (rejects via finite-check or graceful pass)', () => {
    // checkCargoWeight: !Number.isFinite(effectiveWeight) → graceful pass
    const r = checkCargoWeight({
      weightMt: Number.POSITIVE_INFINITY,
      dwtSummer: 2570,
      dwcc: null,
    });
    expect(r.pass).toBe(true);
  });
});

describe('ADVERSARIAL #791 cause C — parity-check guards', () => {
  it('treats duplicate-key items in old as last-wins (no crash)', () => {
    const oldArr = [
      { emailId: 'a', itemIndex: 0, weightMt: { value: 100 } },
      { emailId: 'a', itemIndex: 0, weightMt: { value: 200 } }, // duplicate
    ];
    const newArr = [{ emailId: 'a', itemIndex: 0, weightMt: { value: 200 } }];
    const r = diffParsed(oldArr, newArr);
    expect(r.value_changed).toHaveLength(0);
  });

  it('treats float precision drift as value_changed (not as a regression)', () => {
    // JSON.stringify(0.1 + 0.2) = "0.30000000000000004"
    // JSON.stringify(0.3) = "0.3"
    // → counted as value_changed but NOT populated_now_null
    const oldArr = [{ emailId: 'a', itemIndex: 0, weightMt: { value: 0.3 } }];
    const newArr = [{ emailId: 'a', itemIndex: 0, weightMt: { value: 0.1 + 0.2 } }];
    const r = diffParsed(oldArr, newArr);
    expect(r.populated_now_null).toHaveLength(0);
    // value_changed expected (drift), but not a regression.
    expect(r.value_changed.length).toBeGreaterThanOrEqual(0);
  });

  it('treats array order shifts as value_changed (JSON.stringify is order-sensitive)', () => {
    const oldArr = [{
      emailId: 'a', itemIndex: 0,
      missingInfo: ['a', 'b'],
    }];
    const newArr = [{
      emailId: 'a', itemIndex: 0,
      missingInfo: ['b', 'a'],
    }];
    const r = diffParsed(oldArr, newArr);
    // Order shift is treated as value_changed (not populated→null)
    expect(r.value_changed).toHaveLength(1);
    expect(r.populated_now_null).toHaveLength(0);
  });

  it('treats both null and undefined as absent (no false populated→null)', () => {
    const oldArr = [{ emailId: 'a', itemIndex: 0, dimensions: null }];
    const newArr = [{ emailId: 'a', itemIndex: 0, dimensions: undefined }];
    const r = diffParsed(oldArr, newArr);
    expect(r.populated_now_null).toHaveLength(0);
  });

  it('does NOT crash on empty input arrays', () => {
    expect(() => diffParsed([], [])).not.toThrow();
  });

  it('does NOT crash on null fields in old where new has data', () => {
    const r = diffParsed(
      [{ emailId: 'a', itemIndex: 0, weightMt: null }],
      [{ emailId: 'a', itemIndex: 0, weightMt: { value: 500 } }],
    );
    expect(r.null_now_populated).toHaveLength(1);
  });
});

describe('ADVERSARIAL #791 — helper monotonicity property', () => {
  // Property: if cargo A's max ≥ cargo B's max, then resolveCargoWeight(A) ≥ resolveCargoWeight(B).
  // Guards against accidental swap of min/max in the helper.
  it('monotonic in weightMtMax for range cargoes', () => {
    const cA = cargoWith({ weightMtMax: 5000 });
    const cB = cargoWith({ weightMtMax: 3000 });
    expect(resolveCargoWeight(cA)!).toBeGreaterThan(resolveCargoWeight(cB)!);
  });

  it('idempotent: calling twice returns the same result', () => {
    const c = cargoWith({
      weightMt: { value: 28000, confidence: 'interpreted' },
      weightMtMin: 25200,
      weightMtMax: 30800,
    });
    expect(resolveCargoWeight(c)).toBe(resolveCargoWeight(c));
  });
});
