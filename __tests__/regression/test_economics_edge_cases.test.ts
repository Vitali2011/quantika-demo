/**
 * Adversarial regression tests for economics functions.
 * Goal: expose bugs, not confirm happy paths.
 * DO NOT fix source code — report only.
 */

import { calculateEuEts } from '@/lib/economics/ets';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';

// ---------------------------------------------------------------------------
// calculateEuEts — edge cases
// ---------------------------------------------------------------------------

describe('calculateEuEts — adversarial', () => {

  // H7 (HIGH): negative vlsfoBurnMt bypasses guard, produces negative amountEur
  it('H7: negative vlsfoBurnMt should not produce negative amountEur', () => {
    const result = calculateEuEts({
      distanceNm: 100,
      euLegPercent: 0.5,
      vlsfoBurnMt: -50,
      euaPrice: 87.5,
    });
    // amount = -50 * 3.114 * 0.5 * 87.5 = -6818.75
    // Bug: amountEur = -6818.75, applicable = false
    // Expected: amountEur should be 0 (or input should be rejected)
    expect(result.amountEur).toBeGreaterThanOrEqual(0);
  });

  // H7 corollary: applicable must be consistent with amountEur
  it('H7b: applicable flag must be false when amountEur is negative (consistency check)', () => {
    const result = calculateEuEts({
      distanceNm: 100,
      euLegPercent: 0.5,
      vlsfoBurnMt: -50,
      euaPrice: 87.5,
    });
    // If amountEur is negative but applicable is false, downstream code that
    // ignores the flag and sums amountEur directly will subtract cost from total.
    if (result.amountEur < 0) {
      // Bug confirmed: flag is false but value is negative — silent corruption risk
      expect(result.applicable).toBe(false); // this passes, but the real bug is amountEur < 0
      // Force a failure to surface the bug
      expect(result.amountEur).toBeGreaterThanOrEqual(0);
    }
  });

  // H8 (HIGH): euLegPercent > 1.0 — no upper bound validation
  it('H8: euLegPercent > 1.0 should be rejected or clamped to 1.0', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 2.0,    // invalid: > 100%
      vlsfoBurnMt: 100,
      euaPrice: 87.5,
    });
    // amount = 100 * 3.114 * 2.0 * 87.5 = 54495 EUR
    // Expected: should not exceed the result for euLegPercent=1.0
    const maxLegitimate = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 100,
      euaPrice: 87.5,
    });
    expect(result.amountEur).toBeLessThanOrEqual(maxLegitimate.amountEur);
  });

  // H8b: euLegPercent exactly at boundary 1.0 must work normally
  it('H8b: euLegPercent = 1.0 (boundary) is valid and should produce correct result', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 100,
      euaPrice: 87.5,
    });
    // 100 * 3.151 (VLSFO default) * 1.0 * 1.0 (phaseIn 2026) * 87.5 = 27571.25
    expect(result.amountEur).toBe(27571.25);
    expect(result.applicable).toBe(true);
  });

  // H9: negative euaPrice — price cannot be negative
  it('H9: negative euaPrice should not produce negative amountEur', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: -87.5,
    });
    expect(result.amountEur).toBeGreaterThanOrEqual(0);
  });

  // H9b: zero euaPrice
  it('H9b: zero euaPrice should return amountEur = 0, applicable = false', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: 0,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  // Guard boundary: distanceNm = 0 returns early
  it('guard: distanceNm = 0 returns {0, false}', () => {
    const result = calculateEuEts({ distanceNm: 0, euLegPercent: 0.5, vlsfoBurnMt: 100, euaPrice: 87.5 });
    expect(result).toEqual({ amountEur: 0, applicable: false });
  });

  // Guard boundary: euLegPercent = 0 returns early
  it('guard: euLegPercent = 0 returns {0, false}', () => {
    const result = calculateEuEts({ distanceNm: 1000, euLegPercent: 0, vlsfoBurnMt: 100, euaPrice: 87.5 });
    expect(result).toEqual({ amountEur: 0, applicable: false });
  });

  // Negative distanceNm bypasses guard? No — <= 0 catches it
  it('guard: negative distanceNm returns {0, false}', () => {
    const result = calculateEuEts({ distanceNm: -500, euLegPercent: 0.5, vlsfoBurnMt: 100, euaPrice: 87.5 });
    expect(result).toEqual({ amountEur: 0, applicable: false });
  });

  // Negative euLegPercent bypasses guard?
  it('guard: negative euLegPercent returns {0, false}', () => {
    const result = calculateEuEts({ distanceNm: 1000, euLegPercent: -0.5, vlsfoBurnMt: 100, euaPrice: 87.5 });
    expect(result).toEqual({ amountEur: 0, applicable: false });
  });

  // Both vlsfoBurnMt=0 and valid other params
  it('zero vlsfoBurnMt produces amountEur=0, applicable=false', () => {
    const result = calculateEuEts({ distanceNm: 1000, euLegPercent: 0.5, vlsfoBurnMt: 0, euaPrice: 87.5 });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  // BUG-A3-2 explicit: euLegPercent > 1.0 out-of-range → rejected
  it('euLegPercent: 1.5 is out of range → {amountEur: 0, applicable: false}', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.5,
      vlsfoBurnMt: 100,
      euaPrice: 87.5,
    });
    expect(result).toEqual({ amountEur: 0, applicable: false });
  });
});

// ---------------------------------------------------------------------------
// calculateWarRiskPremium — edge cases
// ---------------------------------------------------------------------------

describe('calculateWarRiskPremium — adversarial', () => {

  // H10 (MEDIUM): substring false positive — "Lagoswana" triggers 'lagos' match
  it('H10: fromPort "Lagoswana" should NOT trigger Gulf of Guinea HRA (false positive)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagoswana', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    // Bug: "lagoswana".includes("lagos") === true → falsely matches Gulf of Guinea
    expect(result.zones).toHaveLength(0);
    expect(result.premiumUsd).toBe(0);
  });

  // H10b: "Port Dakar North" — 'dakar' substring match, is it a real Dakar call?
  // Dakar is in ports list — but "dakar" in "Port Dakar North" is intentional.
  // This test checks a clearly fabricated port name with 'dakar' embedded.
  it('H10b: fromPort "Sindakar" (contains dakar) should NOT trigger Gulf of Guinea HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Sindakar', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    // "sindakar".includes("dakar") === true — false positive
    expect(result.zones).toHaveLength(0);
    expect(result.premiumUsd).toBe(0);
  });

  // H10c: "Jeddah" in toPort correctly matches Red Sea
  it('H10c: toPort "Jeddah" correctly triggers Red Sea HRA (true positive must still work)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Jeddah' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    });
    expect(result.zones).toContain('Red Sea / Bab al-Mandeb HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  // H11: fromPort and toPort both in Red Sea — should NOT double-count
  it('H11: from=Aden to=Jeddah (same Red Sea zone) should charge only once', () => {
    const sameZone = calculateWarRiskPremium({
      route: { fromPort: 'Aden', toPort: 'Jeddah' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    });
    const singlePort = calculateWarRiskPremium({
      route: { fromPort: 'Aden', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    });
    // Both should produce same premium (zone matched once in both cases)
    expect(sameZone.premiumUsd).toBe(singlePort.premiumUsd);
    expect(sameZone.zones.filter(z => z === 'Red Sea / Bab al-Mandeb HRA')).toHaveLength(1);
  });

  // H12: daysInHra = 0 — informational only since spec-betafix-04 (per-voyage model).
  // daysInHra no longer affects premium; zones still matched from port name.
  it('daysInHra = 0 does not crash, zone still matched, premium uses per-voyage rate', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 0,
    });
    expect(result.zones).toContain('Gulf of Guinea HRA');
    // per-voyage: 10_000_000 * 0.0005 = 5000
    expect(result.premiumUsd).toBe(5000);
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  // H13: negative daysInHra — informational only, does not affect calculation.
  it('negative daysInHra does not crash, zone still matched, premium uses per-voyage rate', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: -5,
    });
    expect(result.zones).toContain('Gulf of Guinea HRA');
    expect(result.premiumUsd).toBe(5000);
  });

  // H14: vesselValueUsd = 0 — code uses industry fallback ($8M) per spec-betafix-04.
  // Avoids 0-premium on a 0-valued vessel (data entry error scenario).
  it('vesselValueUsd = 0 uses fallback $8M, zone matched, premium > 0', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: 0,
      daysInHra: 5,
    });
    // Zone should still be matched since port was recognised
    expect(result.zones).toContain('Gulf of Guinea HRA');
    // Fallback: 8_000_000 * 0.0005 = 4000
    expect(result.premiumUsd).toBe(4000);
  });

  // H15: negative vesselValueUsd — no validation, produces negative premium
  it('H15: negative vesselValueUsd should not produce negative premiumUsd', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: -10_000_000,
      daysInHra: 5,
    });
    expect(result.premiumUsd).toBeGreaterThanOrEqual(0);
  });

  // H16: viaCanal "Suez" triggers both Red Sea AND Indian Ocean zones simultaneously
  it('H16: viaCanal=Suez triggers both Red Sea and Indian Ocean zones (verify multi-zone)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Rotterdam', viaCanal: 'Suez' },
      vesselValueUsd: 10_000_000,
      daysInHra: 10,
    });
    // Both Red Sea and Indian Ocean have 'suez' in canals
    expect(result.zones).toContain('Red Sea / Bab al-Mandeb HRA');
    expect(result.zones).toContain('Indian Ocean / Somali Corridor HRA');
    // Max rate used = Red Sea (0.075%) > Indian Ocean (0.04%)
    const redSeaOnly = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Jeddah' },
      vesselValueUsd: 10_000_000,
      daysInHra: 10,
    });
    expect(result.premiumUsd).toBe(redSeaOnly.premiumUsd);
  });

  // H17: empty fromPort and toPort strings — should not crash
  it('empty fromPort/toPort strings do not crash', () => {
    expect(() => calculateWarRiskPremium({
      route: { fromPort: '', toPort: '' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    })).not.toThrow();
  });

  // H18: "LAGOS" uppercase — does toLowerCase handle it correctly?
  it('uppercase port name "LAGOS" correctly matches Gulf of Guinea HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'LAGOS', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    expect(result.zones).toContain('Gulf of Guinea HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  // F29-F1 regression: Bab-el-Mandab / Bab al-Mandab strait must trigger Red Sea HRA
  // Prior to fix, neither spelling was in the ports list — routes through the strait
  // received no surcharge after PR #29 hyphen normalization.
  it('F29-F1: fromPort "Bab-el-Mandab" triggers Red Sea HRA (hyphen normalized to space)', () => {
    // Hyphen normalization: "Bab-el-Mandab" → "bab el mandab" → matches keyword
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Bab-el-Mandab', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    expect(result.zones).toContain('Red Sea / Bab al-Mandeb HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  it('F29-F1: fromPort "Bab el-Mandab" (mixed hyphen) triggers Red Sea HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Bab el-Mandab', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    expect(result.zones).toContain('Red Sea / Bab al-Mandeb HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  it('F29-F1: toPort "Bab al-Mandab" (al-variant) triggers Red Sea HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Bab al-Mandab' },
      vesselValueUsd: 10_000_000,
      daysInHra: 2,
    });
    expect(result.zones).toContain('Red Sea / Bab al-Mandeb HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  it('F29-F1: toPort "Bab el-Mandab" (el-variant with hyphen) triggers Red Sea HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Bab el-Mandab' },
      vesselValueUsd: 10_000_000,
      daysInHra: 2,
    });
    expect(result.zones).toContain('Red Sea / Bab al-Mandeb HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  // H19: premium math precision — per-voyage model (spec-betafix-04).
  // Rate is per-transit, NOT per-day. daysInHra is informational only.
  it('premium math: Black Sea 0.10%, $20M vessel — per-voyage rate applied', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Odessa', toPort: 'Istanbul' },
      vesselValueUsd: 20_000_000,
      daysInHra: 2,
    });
    // per-voyage: 20_000_000 * (0.10 / 100) = 20_000_000 * 0.001 = 20_000
    const expected = Math.round(20_000_000 * 0.001 * 100) / 100;
    expect(result.premiumUsd).toBe(expected);
    expect(result.zones).toContain('Black Sea Russia/Ukraine HRA');
  });

  // BUG-B8: Tin Can Bay — hyphenated variant should resolve via port normalisation
  // "Tin-Can Bay" → toLowerCase().replace(/-/g, ' ') → "tin can bay"
  // → \btin can\b matches → Gulf of Guinea HRA detected
  it('BUG-B8: fromPort "Tin-Can Bay" detects Gulf of Guinea HRA (hyphen normalised to space)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Tin-Can Bay', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    expect(result.zones).toContain('Gulf of Guinea HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  it('BUG-B8: fromPort "Tin Can Bay" (no hyphen) detects Gulf of Guinea HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Tin Can Bay', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    expect(result.zones).toContain('Gulf of Guinea HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });
});
