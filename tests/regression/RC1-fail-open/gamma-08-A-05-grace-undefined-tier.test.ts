// Regression Lock: QA adversarial 2026-05-12 (fixed 2026-05-12)
// Class: A (Empty/falsy) | Severity: CRITICAL → FIXED
// Finding: A-08 — getChartererGraceDays must handle undefined/null tier gracefully
// Fix: function now accepts optional tier and returns 0 for undefined/null/empty
// Spec: gamma-08-subs-timer-v2
// DO NOT DELETE — see references/regression_lock_workflow.md

import { getChartererGraceDays } from '@/lib/deadlines/subs-guardian';

describe('regression gamma-08-A-08: getChartererGraceDays handles undefined/null tier gracefully', () => {
  it('returns 0 when tier is undefined (graceful fallback)', () => {
    // @ts-expect-error — testing runtime behavior with undefined
    expect(getChartererGraceDays(undefined)).toBe(0);
  });

  it('returns 0 when tier is null (graceful fallback)', () => {
    // @ts-expect-error — testing runtime behavior with null
    expect(getChartererGraceDays(null)).toBe(0);
  });

  it('returns 0 when tier is empty string (graceful fallback)', () => {
    // @ts-expect-error — testing runtime behavior with empty string
    expect(getChartererGraceDays('')).toBe(0);
  });

  it('Widget with undefined chartererTier is safe — no crash if guard removed', () => {
    // Fix verified: function returns 0 for undefined, so refactoring widget
    // to remove the && guard won't cause a production crash
    const tier: 'blue-chip' | 'second' | 'weak' | undefined = undefined;
    // @ts-expect-error
    expect(getChartererGraceDays(tier)).toBe(0);
  });
});
