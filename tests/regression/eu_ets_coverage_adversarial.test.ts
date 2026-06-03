/**
 * Adversarial QA — EU ETS coverage factor (feat/carbon-inout-eu)
 *
 * Cold-start reviewer. Zero context from feature session.
 * Goal: break the code, not confirm it works.
 *
 * Attack surface:
 *   Class 1 — Math precision
 *   Class 2 — Backward compat (absent flags)
 *   Class 3 — Edge cases (partial flags, NaN, false+false)
 *   Class 4 — Double-counting (euLegPercent + coverageFactor interaction)
 *   Class 5 — Extra-EU early exit overrides euLegPercent>0
 */

import { calculateEuEts } from '../../lib/economics/ets';
import { calculateTCE } from '../../lib/economics/voyage-calculator';

// ─────────────────────────────────────────────────────────────────────────────
// Shared base fixture (year=2026 → phaseIn=1.0, no noise from phase-in)
// ─────────────────────────────────────────────────────────────────────────────
const BASE_ETS = {
  distanceNm: 3000,
  vlsfoBurnMt: 100,
  euaPrice: 100,
  year: 2026,
};

// Expected full-coverage amount (no flags, euLegPercent=1.0):
// 100 × 3.151 × 1.0 × 1.0 × 100 × 1.0 = 31510
const FULL_AMOUNT = 100 * 3.151 * 1.0 * 1.0 * 100 * 1.0; // 31510

// ─────────────────────────────────────────────────────────────────────────────
// CLASS 1 — Math precision
// ─────────────────────────────────────────────────────────────────────────────
describe('Class 1 — Math precision', () => {
  it('both-EU amount equals no-flag amount EXACTLY (not just approximately)', () => {
    const withFlags = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: true,
      destEu: true,
    });
    const noFlags = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
    });
    // Must be bit-identical, not just close
    expect(withFlags.amountEur).toBe(noFlags.amountEur);
    // Sanity check the actual value
    expect(withFlags.amountEur).toBe(Math.round(FULL_AMOUNT * 100) / 100);
  });

  it('one-EU amount is exactly HALF of both-EU amount (before rounding)', () => {
    const bothEu = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: true,
      destEu: true,
    });
    const oneEu = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: true,
      destEu: false,
    });
    // 31510 / 2 = 15755 — both are round numbers, so rounding artifacts do not apply here
    expect(oneEu.amountEur).toBe(bothEu.amountEur / 2);
  });

  it('rounding: 2 decimal places preserved on fractional result', () => {
    // 100 × 3.151 × 0.33 × 1.0 × 100 × 0.5 = 5198.85 (3.151*33 = 103.983, *50 = 5199.15... let's compute)
    // Actually: 100 * 3.151 * 0.33 * 1.0 * 100 * 0.5 = 100 * 3.151 * 16.5 = 5199.15
    const raw = 100 * 3.151 * 0.33 * 1.0 * 100 * 0.5;
    const expected = Math.round(raw * 100) / 100;
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 0.33,
      originEu: true,
      destEu: false,
    });
    expect(result.amountEur).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS 2 — Backward compat (absent flags = coverageFactor 1.0)
// ─────────────────────────────────────────────────────────────────────────────
describe('Class 2 — Backward compat (absent flags)', () => {
  it('absent originEu and destEu: coverageFactor must be 1.0 (conservative)', () => {
    const result = calculateEuEts({ ...BASE_ETS, euLegPercent: 1.0 });
    expect(result.amountEur).toBe(Math.round(FULL_AMOUNT * 100) / 100);
    expect(result.applicable).toBe(true);
  });

  it('absent flags with euLegPercent=0.5: amount is 50% of full (euLegPercent does the work)', () => {
    const halfLeg = calculateEuEts({ ...BASE_ETS, euLegPercent: 0.5 });
    // 100 × 3.151 × 0.5 × 1.0 × 100 × 1.0 = 15755
    const expected = Math.round(100 * 3.151 * 0.5 * 1.0 * 100 * 1.0 * 100) / 100;
    expect(halfLeg.amountEur).toBe(expected);
  });

  it('explicitly undefined originEu and destEu: same as fully absent', () => {
    const withUndefined = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: undefined,
      destEu: undefined,
    });
    const fullyAbsent = calculateEuEts({ ...BASE_ETS, euLegPercent: 1.0 });
    expect(withUndefined.amountEur).toBe(fullyAbsent.amountEur);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS 3 — Edge cases (partial flags, boolean coercion, zero/NaN inputs)
// ─────────────────────────────────────────────────────────────────────────────
describe('Class 3 — Edge cases', () => {
  it('originEu=true, destEu=undefined: triggers 0.5 (one flag defined = one EU port)', () => {
    // originEu !== undefined is true → enters the block; euCount = 1 → coverageFactor = 0.5
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: true,
      destEu: undefined,
    });
    // Should be HALF of full (coverageFactor=0.5)
    const expected = Math.round(FULL_AMOUNT * 0.5 * 100) / 100;
    expect(result.amountEur).toBe(expected);
    expect(result.applicable).toBe(true);
  });

  it('originEu=undefined, destEu=true: also triggers 0.5 (one flag defined)', () => {
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: undefined,
      destEu: true,
    });
    const expected = Math.round(FULL_AMOUNT * 0.5 * 100) / 100;
    expect(result.amountEur).toBe(expected);
    expect(result.applicable).toBe(true);
  });

  it('originEu=false, destEu=undefined: triggers block; euCount=0 → coverageFactor=0 → applicable=false', () => {
    // originEu !== undefined is true → enters block; originEu=false→0, destEu=undefined→0; euCount=0
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: false,
      destEu: undefined,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('both flags false: coverageFactor=0 → amountEur=0, applicable=false', () => {
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      euaPrice: 87.5,
      vlsfoBurnMt: 200,
      distanceNm: 3000,
      originEu: false,
      destEu: false,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('NaN in euaPrice returns applicable=false even with valid EU flags', () => {
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      euaPrice: NaN,
      originEu: true,
      destEu: true,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('Infinity in vlsfoBurnMt returns applicable=false', () => {
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      vlsfoBurnMt: Infinity,
      originEu: true,
      destEu: true,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('euLegPercent=0 causes early exit (applicable=false) BEFORE coverageFactor matters', () => {
    // Guards check euLegPercent <= 0 before coverageFactor — should short-circuit
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 0,
      originEu: true,
      destEu: true,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS 4 — Double-counting: euLegPercent + coverageFactor interaction
// ─────────────────────────────────────────────────────────────────────────────
describe('Class 4 — Double-counting', () => {
  // ADVERSARIAL: manual caller passes euLegPercent=0.5 AND one-EU flags
  // This is NOT how the route.ts uses it (route always sets euLegPercent=1.0),
  // but a direct API caller to calculateEuEts could do this.
  // Formula: vlsfoBurnMt * cf * euLegPercent * phase * euaPrice * coverageFactor
  //   = 100 * 3.151 * 0.5 * 1.0 * 100 * 0.5 = 7877.5  ← DOUBLE-COUNTED
  // vs correct one-EU amount:
  //   = 100 * 3.151 * 1.0 * 1.0 * 100 * 0.5 = 15755    ← CORRECT
  it('DOUBLE-COUNT PROBE: euLegPercent=0.5 + one-EU flags → effectively 0.25 coverage (potential misuse)', () => {
    const doubleCounted = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 0.5,
      originEu: true,
      destEu: false,
    });
    const correctOneEu = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: true,
      destEu: false,
    });
    const oldStyleOneEu = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 0.5,
      // no flags → coverageFactor=1.0
    });

    // Document the double-count: doubleCounted should be HALF of correctOneEu
    // This exposes that callers who pass euLegPercent=0.5 AND one-EU flags
    // will get 25% coverage instead of 50%. This is a API misuse trap.
    expect(doubleCounted.amountEur).toBe(correctOneEu.amountEur / 2);

    // Also confirm old-style (no flags) euLegPercent=0.5 == new-style euLegPercent=1.0 + flags
    expect(oldStyleOneEu.amountEur).toBe(correctOneEu.amountEur);
  });

  // Verify one-EU end-to-end from voyage-calculator: euLegPercent=1.0 + flags
  // Expected: 100 * 3.151 * 1.0 * 1.0 * 100 * 0.5 = 15755
  it('one-EU end-to-end via calculateTCE: originEu=true + destEu=false + euLegPercent=1.0 → ets_eur≈15755', () => {
    const result = calculateTCE({
      vessel: { dwt: 30000, valueUsd: 0, speedKts: 13, consumptionMtPerDay: 100 },
      route: { originPort: 'NLRTM', destinationPort: 'USNYC', distanceNm: 3000 },
      cargo: { quantityMt: 25000, freightRateUsdPerMt: 30 },
      bunkerPriceUsdPerMt: 0, // isolate ETS
      euaPriceEur: 100,
      durationDays: 1,
      euLegPercent: 1.0,
      originEu: true,
      destEu: false,
    });
    // 100 * 3.151 * 1.0 * 1.0 * 100 * 0.5 = 15755
    expect(result.breakdown.ets_eur).toBeCloseTo(15755, 1);
    expect(result.breakdown.applicable.ets).toBe(true);
  });

  // Verify backward-compat: no flags, euLegPercent=0.5 → same 15755
  it('backward-compat end-to-end via calculateTCE: no flags + euLegPercent=0.5 → ets_eur≈15755 (no double-count)', () => {
    const result = calculateTCE({
      vessel: { dwt: 30000, valueUsd: 0, speedKts: 13, consumptionMtPerDay: 100 },
      route: { originPort: 'NLRTM', destinationPort: 'USNYC', distanceNm: 3000 },
      cargo: { quantityMt: 25000, freightRateUsdPerMt: 30 },
      bunkerPriceUsdPerMt: 0, // isolate ETS
      euaPriceEur: 100,
      durationDays: 1,
      euLegPercent: 0.5,
      // no originEu / destEu → coverageFactor=1.0
    });
    // 100 * 3.151 * 0.5 * 1.0 * 100 * 1.0 = 15755
    expect(result.breakdown.ets_eur).toBeCloseTo(15755, 1);
    expect(result.breakdown.applicable.ets).toBe(true);
  });

  it('both-EU end-to-end via calculateTCE: both flags + euLegPercent=1.0 → ets_eur≈31510 (full coverage)', () => {
    const result = calculateTCE({
      vessel: { dwt: 30000, valueUsd: 0, speedKts: 13, consumptionMtPerDay: 100 },
      route: { originPort: 'NLRTM', destinationPort: 'DEHAM', distanceNm: 3000 },
      cargo: { quantityMt: 25000, freightRateUsdPerMt: 30 },
      bunkerPriceUsdPerMt: 0,
      euaPriceEur: 100,
      durationDays: 1,
      euLegPercent: 1.0,
      originEu: true,
      destEu: true,
    });
    // 100 * 3.151 * 1.0 * 1.0 * 100 * 1.0 = 31510
    expect(result.breakdown.ets_eur).toBeCloseTo(31510, 1);
    expect(result.breakdown.applicable.ets).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS 5 — Extra-EU early exit must override euLegPercent>0
// ─────────────────────────────────────────────────────────────────────────────
describe('Class 5 — Extra-EU early exit overrides euLegPercent', () => {
  it('originEu=false, destEu=false, euLegPercent=0.5 → applicable=false, amountEur=0', () => {
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 0.5,
      originEu: false,
      destEu: false,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('originEu=false, destEu=false, euLegPercent=1.0 → applicable=false (euLegPercent=1.0 does not rescue it)', () => {
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      originEu: false,
      destEu: false,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('extra-EU via calculateTCE: originEu=false, destEu=false → ets_eur=0, ets_usd=0', () => {
    const result = calculateTCE({
      vessel: { dwt: 30000, valueUsd: 0, speedKts: 13, consumptionMtPerDay: 100 },
      route: { originPort: 'SGSIN', destinationPort: 'AEDXB', distanceNm: 3000 },
      cargo: { quantityMt: 25000, freightRateUsdPerMt: 30 },
      bunkerPriceUsdPerMt: 0,
      euaPriceEur: 100,
      durationDays: 1,
      euLegPercent: 1.0, // non-zero — should still yield 0 because of coverage factor
      originEu: false,
      destEu: false,
    });
    expect(result.breakdown.ets_eur).toBe(0);
    expect(result.breakdown.ets_usd).toBe(0);
    expect(result.breakdown.applicable.ets).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS 6 — Phase-in year edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe('Class 6 — Phase-in year edge cases', () => {
  it('year=2023 → phaseIn=0 → amountEur=0 even with both EU flags', () => {
    const result = calculateEuEts({
      ...BASE_ETS,
      euLegPercent: 1.0,
      year: 2023,
      originEu: true,
      destEu: true,
    });
    expect(result.amountEur).toBe(0);
    // Note: applicable could be true or false here depending on formula path
    // The guards don't check phase directly, but amount will be 0
    // The return will be applicable: amount > 0 → false
    expect(result.applicable).toBe(false);
  });

  it('year=2024 → phaseIn=0.4 → amount is 40% of 2026 amount', () => {
    const base2026 = calculateEuEts({
      ...BASE_ETS, euLegPercent: 1.0, year: 2026, originEu: true, destEu: true,
    });
    const result2024 = calculateEuEts({
      ...BASE_ETS, euLegPercent: 1.0, year: 2024, originEu: true, destEu: true,
    });
    expect(result2024.amountEur).toBeCloseTo(base2026.amountEur * 0.4, 1);
  });

  it('year=2025 → phaseIn=0.7 → amount is 70% of 2026 amount', () => {
    const base2026 = calculateEuEts({
      ...BASE_ETS, euLegPercent: 1.0, year: 2026, originEu: true, destEu: true,
    });
    const result2025 = calculateEuEts({
      ...BASE_ETS, euLegPercent: 1.0, year: 2025, originEu: true, destEu: true,
    });
    expect(result2025.amountEur).toBeCloseTo(base2026.amountEur * 0.7, 1);
  });

  it('year=2027+ → phaseIn=1.0 (no regression; schedule capped at 100%)', () => {
    const result2026 = calculateEuEts({
      ...BASE_ETS, euLegPercent: 1.0, year: 2026, originEu: true, destEu: true,
    });
    const result2027 = calculateEuEts({
      ...BASE_ETS, euLegPercent: 1.0, year: 2027, originEu: true, destEu: true,
    });
    const result2030 = calculateEuEts({
      ...BASE_ETS, euLegPercent: 1.0, year: 2030, originEu: true, destEu: true,
    });
    expect(result2027.amountEur).toBe(result2026.amountEur);
    expect(result2030.amountEur).toBe(result2026.amountEur);
  });
});
