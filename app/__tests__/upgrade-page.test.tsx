/**
 * @jest-environment jsdom
 *
 * Contract tests for /upgrade — real subscription tier page.
 * Phase 2a: RED state — verifies NEW content spec (tier cards, sales CTA).
 * These tests define the contract; implementation does NOT exist yet.
 *
 * Spec ref: week-C-stubs Phase 1 scope — upgrade page content
 * OLD stub tests remain in __tests__/pages/upgrade-page.test.tsx (different assertions).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

import UpgradePage from '@/app/upgrade/page';

describe('/upgrade tier cards page', () => {
  test('renders "Upgrade Your Quantika Plan" heading', () => {
    render(<UpgradePage />);
    expect(
      screen.getByRole('heading', { name: /Upgrade Your Quantika Plan/i })
    ).toBeInTheDocument();
  });

  test('renders "Free" tier name', () => {
    render(<UpgradePage />);
    expect(screen.getByText(/^Free$/i)).toBeInTheDocument();
  });

  test('renders "Pro" tier name', () => {
    render(<UpgradePage />);
    expect(screen.getByText(/^Pro$/i)).toBeInTheDocument();
  });

  test('renders "Enterprise" tier name', () => {
    render(<UpgradePage />);
    expect(screen.getByText(/^Enterprise$/i)).toBeInTheDocument();
  });

  test('CTA link has href="mailto:sales@quantika.org"', () => {
    render(<UpgradePage />);
    // Spec: "Contact Sales" CTA → mailto:sales@quantika.org
    const link = screen.getByRole('link', { name: /contact sales/i });
    expect(link).toHaveAttribute('href', 'mailto:sales@quantika.org');
  });

  test('page container has sm: responsive class', () => {
    const { container } = render(<UpgradePage />);
    // Spec: mobile-responsive with sm: breakpoints on tier card grid
    const smClassRegex = /\bsm:/;
    const allElements = container.querySelectorAll('[class]');
    const hasSmBreakpoint = Array.from(allElements).some((el) =>
      smClassRegex.test(el.getAttribute('class') ?? '')
    );
    expect(hasSmBreakpoint).toBe(true);
  });
});
