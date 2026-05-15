/**
 * UX cleanup bundle: FuelEU voyageDays derivation.
 * Audit 2026-05-13 — components/match/EconomicsTab.tsx hardcoded
 * `estimatedVoyageDays = 15`. Now computed from route distance + vessel speed.
 *
 * Formula: voyageDays = max(1, round(distanceNm / (speedKnots * 24)))
 * Fallback speed: 12 kn when vessel speed is missing/invalid.
 * Missing distance → 0 (FuelEU calc skipped / "n/a" in UI).
 */
import { estimateVoyageDays } from '@/lib/economics/voyage-days';

describe('estimateVoyageDays', () => {
  test('5000 nm at 12 kn → ~17 days', () => {
    expect(estimateVoyageDays(5000, 12)).toBe(17);
  });

  test('1500 nm at 10 kn → ~6 days', () => {
    expect(estimateVoyageDays(1500, 10)).toBe(6);
  });

  test('missing distance returns 0', () => {
    expect(estimateVoyageDays(null, 14)).toBe(0);
    expect(estimateVoyageDays(undefined, 14)).toBe(0);
  });

  test('missing or zero speed falls back to 12 kn', () => {
    // 5000 / (12*24) ≈ 17.36 → 17
    expect(estimateVoyageDays(5000, null)).toBe(17);
    expect(estimateVoyageDays(5000, 0)).toBe(17);
    expect(estimateVoyageDays(5000, undefined)).toBe(17);
  });

  test('very short distance clamps to minimum 1 day', () => {
    // 50 / (14*24) ≈ 0.15 → max(1, round(0.15)) = 1
    expect(estimateVoyageDays(50, 14)).toBe(1);
  });

  test('negative or NaN inputs return 0', () => {
    expect(estimateVoyageDays(-100, 12)).toBe(0);
    expect(estimateVoyageDays(NaN, 12)).toBe(0);
    expect(estimateVoyageDays(5000, NaN)).toBe(17); // fallback applies
  });
});
