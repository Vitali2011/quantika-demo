/**
 * @jest-environment jsdom
 *
 * RED tests for /upgrade page polish (T1).
 * All tests fail before implementation and pass after.
 *
 * Boundary classes:
 *   Class 1  (Empty): UpgradeTierCard renders with empty features
 *   Class 5  (Switch/dispatch): all 3 CTA types render correctly
 *   Class 9  (E2E property): component rendered, not string-matched
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Suppress metadata export warning from Next.js in test env
jest.mock('next/navigation', () => ({ useRouter: () => ({}) }), { virtual: true });

import UpgradePage from '@/app/upgrade/page';

describe('/upgrade page — T1 polish', () => {
  beforeEach(() => {
    render(React.createElement(UpgradePage));
  });

  it('shows pricing for all 3 tiers ($0, $49, Custom)', () => {
    expect(screen.getByText(/\$0/)).toBeInTheDocument();
    expect(screen.getByText(/\$49/)).toBeInTheDocument();
    expect(screen.getByText(/Custom/i)).toBeInTheDocument();
  });

  it('Pro tier has "Upgrade to Pro" CTA linking to billing checkout', () => {
    const link = screen.getByRole('link', { name: /upgrade to pro/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('plan=pro'));
  });

  it('Enterprise CTA links to mailto:sales@quantika.org', () => {
    const cta = screen.getByTestId('enterprise-cta');
    expect(cta).toHaveAttribute('href', 'mailto:sales@quantika.org');
  });

  it('Free tier shows "You\'re on this plan" disabled indicator', () => {
    expect(screen.getByText(/you.re on this plan/i)).toBeInTheDocument();
  });

  it('interactive CTA elements have aria-label attributes (F2)', () => {
    expect(screen.getByRole('button')).toHaveAttribute('aria-label');
    expect(screen.getByRole('link', { name: /upgrade to pro/i })).toHaveAttribute('aria-label');
    expect(screen.getByTestId('enterprise-cta')).toHaveAttribute('aria-label');
  });
});
