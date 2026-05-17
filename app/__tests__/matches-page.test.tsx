/**
 * @jest-environment jsdom
 *
 * Contract tests for /matches — real recent matches page.
 * Phase 2a: RED state — verifies NEW content spec (empty state, /request CTA).
 * These tests define the contract; implementation does NOT exist yet.
 *
 * Spec ref: week-C-stubs Phase 1 scope — matches page content
 * OLD stub tests remain in __tests__/pages/matches-page.test.tsx (different assertions).
 * No /api/matches endpoint exists; page uses static DEMO_MATCHES array.
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

import MatchesPage from '@/app/matches/page';

describe('/matches recent matches page', () => {
  test('renders "Your Recent Matches" heading', () => {
    render(<MatchesPage />);
    expect(
      screen.getByRole('heading', { name: /Your Recent Matches/i })
    ).toBeInTheDocument();
  });

  test('renders empty state text "No matches yet"', () => {
    render(<MatchesPage />);
    // Empty state when DEMO_MATCHES has no entries (or is empty by default in tests)
    expect(screen.getByText(/No matches yet/i)).toBeInTheDocument();
  });

  test('empty state CTA link has href="/request"', () => {
    render(<MatchesPage />);
    // Spec: "Submit your first deal request" → /request
    const link = screen.getByRole('link', { name: /submit your first deal request/i });
    expect(link).toHaveAttribute('href', '/request');
  });
});
