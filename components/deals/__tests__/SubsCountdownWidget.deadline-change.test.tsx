/**
 * @jest-environment jsdom
 *
 * Contract: when subsDeadline prop changes, remaining must update immediately
 * without waiting for the 60-second interval tick.
 *
 * This guards against naive removal of the sync setState in the effect
 * (which would break prop-change handling).
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SubsCountdownWidget from '../SubsCountdownWidget';

describe('SubsCountdownWidget — subsDeadline prop change', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-08T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = originalEnv;
  });

  it('recalculates remaining immediately when subsDeadline prop changes', async () => {
    const { rerender } = render(
      <SubsCountdownWidget dealId="deal-1" subsDeadline="2026-05-10T12:00:00Z" />
    );

    // Initial: 2 days remaining (2026-05-10 - 2026-05-08 = 2 days)
    expect(screen.getByText(/2 days/i)).toBeInTheDocument();

    // Change deadline to 1 hour ahead — should update without waiting for interval
    await act(async () => {
      rerender(
        <SubsCountdownWidget dealId="deal-1" subsDeadline="2026-05-08T13:00:00Z" />
      );
    });

    // Must immediately reflect new deadline (1 hour remaining), not the old one
    expect(screen.getByText(/1 hours/i)).toBeInTheDocument();
    expect(screen.queryByText(/2 days/i)).not.toBeInTheDocument();
  });
});
