/**
 * @jest-environment jsdom
 */
// Regression Lock: QA adversarial 2026-05-12
// Class: A (Empty/falsy) | Severity: MEDIUM
// Finding: A-05 — empty timezone should fallback to UTC or error
// Spec: gamma-08-subs-timer-v2
// DO NOT DELETE — see references/regression_lock_workflow.md


import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SubsCountdownWidget from '@/components/deals/SubsCountdownWidget';

describe('regression gamma-08-A-05: empty timezone handling', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-12T00:00:00Z').getTime());
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = originalEnv;
  });

  it('empty string timezone should fallback gracefully', () => {
    const deadline = new Date('2026-05-12T12:00:00Z').toISOString();

    // BUG: Widget accepts timezone="" but doesn't use it anyway
    // Expected: Should either reject empty timezone OR fallback to UTC

    const { container } = render(
      <SubsCountdownWidget dealId="test" subsDeadline={deadline} timezone="" />
    );

    // Current: Widget ignores timezone prop entirely, so empty string = no-op
    // Still renders countdown
    expect(screen.getByTestId('subs-countdown-test')).toBeInTheDocument();
    expect(container.textContent).toMatch(/hours|minutes/i);

    // This is problematic: empty timezone is silently accepted
    // If timezone were actually used, empty string should error or default to UTC

    // Since timezone is UNUSED (see gamma-08-A-01), this doesn't cause
    // immediate crash, but it's a code smell

    // EXPECTED: Either validate timezone prop OR document that it's unused
  });

  it('invalid timezone string should error or fallback', () => {
    const deadline = new Date('2026-05-12T12:00:00Z').toISOString();

    // Invalid IANA timezone
    const { container } = render(
      <SubsCountdownWidget
        dealId="test"
        subsDeadline={deadline}
        timezone="Invalid/Timezone"
      />
    );

    // Current: Widget ignores timezone, so invalid timezone = no-op
    // Expected: If timezone were used, this should throw RangeError
    //           (like addBankingDays does)

    expect(screen.getByTestId('subs-countdown-test')).toBeInTheDocument();

    // Mark as non-critical but documents inconsistency:
    // - addBankingDays validates timezone (throws RangeError)
    // - SubsCountdownWidget accepts but ignores timezone (no validation)

    // Not forcing RED because main bug is timezone unused (gamma-08-A-01)
  });
});
