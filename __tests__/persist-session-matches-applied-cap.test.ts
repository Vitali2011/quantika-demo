/**
 * FIX 2 — W10.1: patchEconomicsComponent must not crash when appliedCap is undefined
 * (legacy fit_breakdown JSON written before the field was added).
 *
 * Root: persist-session-matches.ts:31 used `!== null`, which is false for undefined,
 * then accessed undefined.ceiling → TypeError → PATCH 500.
 */
import { patchEconomicsComponent } from '@/lib/matching/persist-session-matches';
import type { FitBreakdown } from '@/lib/types';

function baseFb(overrides: Partial<FitBreakdown> = {}): FitBreakdown {
  return {
    fitPercent: 70,
    components: [
      { factor: 'economics', score: 9, weight: 18, rationale: 'seed', label: 'Economics (TCE)' },
      { factor: 'timing', score: 15, weight: 15, rationale: 'seed', label: 'Timing' },
    ],
    totalWeight: 100,
    partCargo: false,
    vesselClass: 'handymax',
    sanctionsPenalty: 0,
    chartererPenalty: 0,
    appliedCap: null,
    inputs: { distanceNm: 3000, gapDays: 2, verdict: 'spot', utilisation: 0.8, vesselDwt: 50000 },
    ...overrides,
  } as unknown as FitBreakdown;
}

describe('patchEconomicsComponent — appliedCap guard', () => {
  it('does NOT crash when appliedCap is undefined (legacy JSON without the field)', () => {
    const fb = baseFb({ appliedCap: undefined as unknown as null });
    expect(() => patchEconomicsComponent(fb, 8000, 50000)).not.toThrow();
    const result = patchEconomicsComponent(fb, 8000, 50000);
    expect(result.fitPercent).toBeGreaterThanOrEqual(0);
    expect(result.fitPercent).toBeLessThanOrEqual(100);
  });

  it('cap fires and clamps to ceiling when rawSum > ceiling', () => {
    // scoreEconomics(50000 tce, 50000 dwt) = 18; timing score = 15; rawSum = 33
    // ceiling 20 < 33 → cap fires → fitPercent must be exactly 20
    const fb = baseFb({
      appliedCap: { ceiling: 20, reason: 'PSC detention' } as unknown as null,
    });
    const result = patchEconomicsComponent(fb, 50000, 50000);
    expect(result.fitPercent).toBe(20);
  });

  it('cap present but does NOT fire when rawSum < ceiling', () => {
    // rawSum = 33; ceiling 40 > 33 → cap does not clamp → fitPercent must be exactly 33
    const fb = baseFb({
      appliedCap: { ceiling: 40, reason: 'PSC detention' } as unknown as null,
    });
    const result = patchEconomicsComponent(fb, 50000, 50000);
    expect(result.fitPercent).toBe(33);
  });

  it('no cap applied when appliedCap is null', () => {
    const fb = baseFb({ appliedCap: null });
    // Should compute normally without cap
    expect(() => patchEconomicsComponent(fb, 8000, 50000)).not.toThrow();
    const result = patchEconomicsComponent(fb, 8000, 50000);
    expect(result.fitPercent).toBeGreaterThanOrEqual(0);
  });
});
