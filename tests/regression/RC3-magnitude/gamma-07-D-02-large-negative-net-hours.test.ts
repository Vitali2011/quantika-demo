// Regression Lock: QA adversarial 2026-05-12
// Class: D (Magnitude errors) | Severity: MEDIUM
// Finding: D-02 — very large negative netHours (despatch) should calculate correctly
// Spec: gamma-07-demurrage-despatch
// DO NOT DELETE — see references/regression_lock_workflow.md

import { calculateDemurrageDespatch } from '@/lib/laytime/dd-calculator';
import type { LaytimeResult } from '@/lib/types';

describe('regression gamma-07-D-02: large negative netHours (despatch)', () => {
  it('very large negative netHours should produce correct large despatch amount', () => {
    // Scenario: vessel finished 1e9 hours early (absurd, but tests magnitude handling)
    const largeNegativeResult: LaytimeResult = {
      allowedLaytimeHours: 120,
      usedLaytimeHours: 0,
      demurrageOrDespatch: 'despatch',
      netHours: -1e9,
      breakdown: [],
    };

    const result = calculateDemurrageDespatch({
      laytimeResult: largeNegativeResult,
      demurrageRateUsdPerDay: 8000,
      despatchRateUsdPerDay: 4000,
    });

    expect(result.status).toBe('despatch');
    expect(result.demurrageAmount).toBe(0);
    expect(result.despatchAmount).toBeGreaterThan(0);
    expect(Number.isFinite(result.despatchAmount)).toBe(true);
    expect(result.despatchAmount).toBeCloseTo((1e9 / 24) * 4000, -5); // rough check
    expect(result.netAmount).toBeLessThan(0); // you earn money
    // NOTE: This test SHOULD pass — verifying no overflow/precision issues
  });
});
