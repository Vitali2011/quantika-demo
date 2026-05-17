/**
 * @jest-environment jsdom
 *
 * Tests for SubsCountdownWidget live interval tick behaviour.
 * Phase 2a — RED tests (impl does not have live interval yet).
 *
 * Contract: after 60 seconds elapse the displayed countdown must update
 * to reflect the new remaining time (setInterval at 60_000 ms).
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import SubsCountdownWidget from '../SubsCountdownWidget';

describe('SubsCountdownWidget — live 60s interval tick', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = originalEnv;
    }
  });

  it('updates countdown display after 60 seconds elapses', () => {
    // Start time: 2026-05-08T12:01:00Z
    // Deadline:   2026-05-09T00:01:00Z
    // Remaining at start: exactly 11h 59m 0s → "11 hours 59 minutes remaining"
    jest.setSystemTime(new Date('2026-05-08T12:01:00Z').getTime());

    const deadline = '2026-05-09T00:01:00Z';
    render(
      <SubsCountdownWidget
        dealId="deal-tick"
        subsDeadline={deadline}
      />
    );

    // Initial render should show 11 hours 59 minutes
    expect(screen.getByText(/11 hours 59 minutes/i)).toBeInTheDocument();

    // Advance system clock by 60 seconds and fire the interval
    act(() => {
      jest.setSystemTime(new Date('2026-05-08T12:02:00Z').getTime());
      jest.advanceTimersByTime(60_000);
    });

    // After one tick: 11 hours 58 minutes remaining
    expect(screen.getByText(/11 hours 58 minutes/i)).toBeInTheDocument();
  });
});
