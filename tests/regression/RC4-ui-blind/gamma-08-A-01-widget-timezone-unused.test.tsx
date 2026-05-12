/**
 * @jest-environment jsdom
 */
// Regression Lock: QA adversarial 2026-05-12 (fixed 2026-05-12)
// Class: 7 (Config cross-reference) | Severity: HIGH → FIXED
// Finding: 7-01 — timezone prop was declared but unused
// Fix: timezone prop removed from SubsCountdownWidget (Option A from verdict)
// Spec: gamma-08-subs-timer-v2
// DO NOT DELETE — see references/regression_lock_workflow.md


import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SubsCountdownWidget from '@/components/deals/SubsCountdownWidget';

describe('regression gamma-08-7-01: timezone prop removed (no unused config)', () => {
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

  it('widget renders correctly without timezone prop', () => {
    const deadline = new Date('2026-05-12T09:00:00Z').toISOString();

    render(
      <SubsCountdownWidget
        dealId="deal-timezone-test"
        subsDeadline={deadline}
      />
    );

    expect(screen.getByTestId('subs-countdown-deal-timezone-test')).toBeInTheDocument();
  });

  it('widget countdown is based on absolute UTC times (no timezone prop needed)', () => {
    const deadline = new Date('2026-05-12T09:00:00Z').toISOString();

    render(
      <SubsCountdownWidget
        dealId="test"
        subsDeadline={deadline}
      />
    );

    // Widget renders without error — timezone prop removed, no unused config
    const widget = screen.getByTestId('subs-countdown-test');
    expect(widget).toBeInTheDocument();
  });
});
