/**
 * Tests for SubsCountdownWidget (γ-08).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SubsCountdownWidget from '../SubsCountdownWidget';

describe('SubsCountdownWidget', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;

  beforeEach(() => {
    // Mock Date.now to fixed timestamp: 2026-05-08 12:00:00 UTC
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-08T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = originalEnv;
  });

  test('renders null when feature flag is disabled', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'false';
    const { container } = render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders null when feature flag is not set', () => {
    delete process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;
    const { container } = render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders countdown when feature flag is enabled', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
      />
    );
    // 2 days = 48 hours remaining
    expect(screen.getByText(/2 days/i)).toBeInTheDocument();
  });

  test('displays hours when less than 1 day remaining', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    // 12 hours remaining
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-09T00:00:00Z"
      />
    );
    expect(screen.getByText(/12 hours/i)).toBeInTheDocument();
  });

  test('displays minutes when less than 1 hour remaining', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    // 30 minutes remaining
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-08T12:30:00Z"
      />
    );
    expect(screen.getByText(/30 minutes/i)).toBeInTheDocument();
  });

  test('shows "Expired" when deadline has passed', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-07T12:00:00Z"
      />
    );
    expect(screen.getByText(/expired/i)).toBeInTheDocument();
  });

  test('displays grace indicator for blue-chip charterer', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
        chartererTier="blue-chip"
      />
    );
    expect(screen.getByText(/grace/i)).toBeInTheDocument();
  });

  test('does not display grace indicator for second-tier charterer', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
        chartererTier="second"
      />
    );
    expect(screen.queryByText(/grace/i)).not.toBeInTheDocument();
  });

  test('does not display grace indicator for weak charterer', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
        chartererTier="weak"
      />
    );
    expect(screen.queryByText(/grace/i)).not.toBeInTheDocument();
  });

  test('handles timezone when provided', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
        timezone="America/New_York"
      />
    );
    // Should render without crashing
    expect(screen.getByText(/days|hours|minutes/i)).toBeInTheDocument();
  });

  test('uses UTC timezone by default', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
      />
    );
    expect(screen.getByText(/2 days/i)).toBeInTheDocument();
  });

  // Boundary: empty/invalid inputs
  test('handles invalid ISO date gracefully', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    const { container } = render(
      <SubsCountdownWidget dealId="deal-1" subsDeadline="invalid-date" />
    );
    // Should render error state or null
    expect(container.textContent).toMatch(/invalid|error/i);
  });

  test('handles empty dealId', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    const { container } = render(
      <SubsCountdownWidget dealId="" subsDeadline="2026-05-10T12:00:00Z" />
    );
    // Should still render countdown
    expect(screen.getByText(/days|hours|minutes/i)).toBeInTheDocument();
  });

  test('handles undefined chartererTier', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
      />
    );
    // Should not show grace indicator
    expect(screen.queryByText(/grace/i)).not.toBeInTheDocument();
  });

  test('handles undefined timezone', () => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
    render(
      <SubsCountdownWidget
        dealId="deal-1"
        subsDeadline="2026-05-10T12:00:00Z"
      />
    );
    // Should default to UTC
    expect(screen.getByText(/2 days/i)).toBeInTheDocument();
  });
});
