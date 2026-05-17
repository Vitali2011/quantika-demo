/**
 * @jest-environment jsdom
 *
 * Contract tests for /upgrade — real subscription tier page.
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

  test('tier card grid has sm:grid-cols-3 responsive class', () => {
    const { container } = render(<UpgradePage />);
    // Spec: mobile-responsive grid — must have sm:grid-cols-3 on the tier grid element
    // (not just any sm: class anywhere in the tree)
    const gridEl = container.querySelector('.sm\\:grid-cols-3');
    expect(gridEl).toBeInTheDocument();
  });
});
