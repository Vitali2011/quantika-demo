/**
 * @jest-environment jsdom
 */
/**
 * Regression: RC-subs-countdown-import (F-01)
 * Guard: NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED controls SubsCountdownWidget visibility.
 * When the flag is NOT 'true', the component must return null.
 * When flag IS 'true', the component must render with demo data.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import SubsCountdownWidget from '@/components/deals/SubsCountdownWidget';

const DEMO_DEAL_ID = 'demo-deal-001';
const DEMO_SUBS_DEADLINE = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

describe('RC-subs-countdown-import — NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED gate', () => {
  const originalValue = process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = originalValue;
    }
  });

  it('widget is absent when NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED is not set', () => {
    delete process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;
    const { container } = render(
      <SubsCountdownWidget
        dealId={DEMO_DEAL_ID}
        subsDeadline={DEMO_SUBS_DEADLINE}
        chartererTier="blue-chip"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('widget is absent when NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED=false', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'false';
    const { container } = render(
      <SubsCountdownWidget
        dealId={DEMO_DEAL_ID}
        subsDeadline={DEMO_SUBS_DEADLINE}
        chartererTier="blue-chip"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('widget is present when NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED=true', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    const { getByTestId } = render(
      <SubsCountdownWidget
        dealId={DEMO_DEAL_ID}
        subsDeadline={DEMO_SUBS_DEADLINE}
        chartererTier="blue-chip"
      />,
    );
    expect(getByTestId(`subs-countdown-${DEMO_DEAL_ID}`)).toBeInTheDocument();
  });
});
