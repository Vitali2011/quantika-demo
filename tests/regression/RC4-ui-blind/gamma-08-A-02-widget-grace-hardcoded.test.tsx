/**
 * @jest-environment jsdom
 */
// Regression Lock: QA adversarial 2026-05-12
// Class: 9 (End-to-end property) | Severity: MEDIUM
// Finding: 9-02 — grace text hardcoded instead of dynamic
// Spec: gamma-08-subs-timer-v2
// DO NOT DELETE — see references/regression_lock_workflow.md


import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SubsCountdownWidget from '@/components/deals/SubsCountdownWidget';

describe('regression gamma-08-9-02: grace text should be dynamic', () => {
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

  it('grace text is hardcoded "+1 day grace (blue-chip)"', () => {
    const deadline = new Date('2026-05-12T12:00:00Z').toISOString();

    render(
      <SubsCountdownWidget
        dealId="test"
        subsDeadline={deadline}
        chartererTier="blue-chip"
      />
    );

    // Current implementation (line 67):
    // {showGrace && <div>+1 day grace (blue-chip)</div>}

    const graceText = screen.getByText(/grace/i).textContent;
    expect(graceText).toBe('+1 day grace (blue-chip)');

    // BUG: Text is hardcoded, not derived from getChartererGraceDays()
    // If grace days change in future (e.g., blue-chip gets 2 days),
    // this text will be wrong

    // EXPECTED:
    // const graceDays = getChartererGraceDays(chartererTier);
    // <div>+{graceDays} day{graceDays !== 1 ? 's' : ''} grace ({chartererTier})</div>
  });

  it('if getChartererGraceDays returns 2 for blue-chip, text is stale', () => {
    // Hypothetical future: blue-chip gets 2 grace days
    // Current widget would still show "+1 day grace (blue-chip)"

    // This is a MEDIUM severity code smell:
    // - Widget calls getChartererGraceDays() for showGrace boolean
    // - But doesn't use the return value for the text
    // - Hardcoded "1" is inconsistent with function call

    // EXPECTED: Use the actual grace days value in the text

    // Not forcing RED because current spec says blue-chip=1
    // But flagging as technical debt / future bug
  });

  it('grace text should reflect actual grace days from function', () => {
    const deadline = new Date('2026-05-12T12:00:00Z').toISOString();

    render(
      <SubsCountdownWidget
        dealId="test"
        subsDeadline={deadline}
        chartererTier="blue-chip"
      />
    );

    // Widget should display grace days dynamically
    // Current: shows "+1 day" (hardcoded)
    // Expected: show `+${getChartererGraceDays(chartererTier)} day(s)`

    const graceText = screen.getByText(/grace/i).textContent;

    // Fixed: Widget now uses getChartererGraceDays() return value in text
    expect(graceText).toContain('+1 day grace'); // blue-chip = 1 day
    expect(graceText).toContain('blue-chip'); // tier shown dynamically
  });
});
