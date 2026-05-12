// Regression Lock: QA adversarial 2026-05-12
// Class: B (Special floats) | Severity: MEDIUM
// Finding: B-03 — days=-0.1 flooring behavior unclear
// Spec: gamma-08-subs-timer-v2
// DO NOT DELETE — see references/regression_lock_workflow.md

import { addBankingDays } from '@/lib/deadlines/subs-guardian';

describe('regression gamma-08-B-03: negative fractional days flooring', () => {
  it('days=-0.1 should floor to -1, not 0', () => {
    // Math.floor(-0.1) = -1 (not 0)
    // This is mathematically correct but potentially surprising

    // Monday 2026-05-11 + (-0.1) days
    // After floor: -1 banking day → Friday 2026-05-08
    const start = new Date('2026-05-11T12:00:00Z'); // Monday
    const result = addBankingDays(start, -0.1, 'UTC');

    // Expected: Math.floor(-0.1) = -1 → subtract 1 banking day → Friday
    expect(result.toISOString()).toBe('2026-05-08T12:00:00.000Z');

    // Current implementation: line 166 `const intDays = Math.floor(days);`
    // Math.floor(-0.1) = -1 ✓

    // This test DOCUMENTS the behavior — not necessarily a bug,
    // but users might expect -0.1 to round to 0 (no change)

    // If this test FAILS, implementation may be rounding instead of flooring
  });

  it('days=-0.9 should floor to -1', () => {
    const start = new Date('2026-05-11T12:00:00Z'); // Monday
    const result = addBankingDays(start, -0.9, 'UTC');

    // Math.floor(-0.9) = -1
    expect(result.toISOString()).toBe('2026-05-08T12:00:00.000Z');
  });

  it('days=-1.1 should floor to -2', () => {
    // Monday 2026-05-11 - 2 banking days
    // → Friday 2026-05-08, skip weekend, Thursday 2026-05-07
    const start = new Date('2026-05-11T12:00:00Z');
    const result = addBankingDays(start, -1.1, 'UTC');

    // Math.floor(-1.1) = -2
    expect(result.toISOString()).toBe('2026-05-07T12:00:00.000Z');
  });

  it('days=0.1 should floor to 0, return same date', () => {
    const start = new Date('2026-05-11T12:00:00Z');
    const result = addBankingDays(start, 0.1, 'UTC');

    // Math.floor(0.1) = 0
    expect(result.toISOString()).toBe(start.toISOString());
  });

  // This test suite documents Math.floor behavior for negative fractions
  // Not a critical bug, but important for API contract clarity

  // PASS expected: Current implementation uses Math.floor correctly
});
