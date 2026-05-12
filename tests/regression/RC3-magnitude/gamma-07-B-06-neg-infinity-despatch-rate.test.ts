// Regression Lock: QA adversarial 2026-05-12
// Class: B (Special floats) | Severity: HIGH
// Finding: B-06 — lib accepts -Infinity for despatchRate, API rejects
// Spec: gamma-07-demurrage-despatch
// DO NOT DELETE — see references/regression_lock_workflow.md

import { calculateDemurrageDespatch } from '@/lib/laytime/dd-calculator';
import type { LaytimeResult } from '@/lib/types';

describe('regression gamma-07-B-06: -Infinity despatchRate rejection', () => {
  it('lib should throw RangeError on -Infinity despatchRateUsdPerDay', () => {
    const laytimeResult: LaytimeResult = {
      allowedLaytimeHours: 120,
      usedLaytimeHours: 96,
      demurrageOrDespatch: 'despatch',
      netHours: -24,
      breakdown: [],
    };

    expect(() =>
      calculateDemurrageDespatch({
        laytimeResult,
        demurrageRateUsdPerDay: 8000,
        despatchRateUsdPerDay: -Infinity,
      })
    ).toThrow(RangeError);
    // NOTE: This test SHOULD pass — lib already validates. Confirming coverage.
  });
});
