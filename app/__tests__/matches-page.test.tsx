/**
 * @jest-environment jsdom
 *
 * Contract tests for /matches — real recent matches page.
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

// Controls what DEMO_MATCHES resolves to — empty by default, populated in dedicated tests
let mockMatchesData: Array<{ vessel: string; route: string; score: number; date: string }> = [];
jest.mock('@/app/matches/demo-data', () => ({
  get DEMO_MATCHES() { return mockMatchesData; },
}));

import MatchesPage from '@/app/matches/page';

describe('/matches recent matches page', () => {
  afterEach(() => {
    mockMatchesData = [];
  });

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

  test('empty state CTA link has href="/dashboard"', () => {
    render(<MatchesPage />);
    // Spec: "Submit your first deal request" → /dashboard (no /request route exists)
    const link = screen.getByRole('link', { name: /submit your first deal request/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  describe('populated list state', () => {
    const THREE_MATCHES = [
      { vessel: 'MV Sunrise', route: 'Dubai → Rotterdam', score: 0.92, date: '2026-05-18' },
      { vessel: 'MV Atlas', route: 'Singapore → Hamburg', score: 0.87, date: '2026-05-17' },
      { vessel: 'MV Titan', route: 'Mumbai → Antwerp', score: 0.75, date: '2026-05-16' },
    ];

    beforeEach(() => {
      mockMatchesData = THREE_MATCHES;
    });

    test('renders all 3 vessel names', () => {
      render(<MatchesPage />);
      expect(screen.getByText('MV Sunrise')).toBeInTheDocument();
      expect(screen.getByText('MV Atlas')).toBeInTheDocument();
      expect(screen.getByText('MV Titan')).toBeInTheDocument();
    });

    test('renders all 3 route strings', () => {
      render(<MatchesPage />);
      expect(screen.getByText('Dubai → Rotterdam')).toBeInTheDocument();
      expect(screen.getByText('Singapore → Hamburg')).toBeInTheDocument();
      expect(screen.getByText('Mumbai → Antwerp')).toBeInTheDocument();
    });

    test('renders score for each match', () => {
      render(<MatchesPage />);
      // Scores are rendered inline with date as "Score: 0.92 · 2026-05-18"
      expect(screen.getByText(/Score: 0\.92/)).toBeInTheDocument();
      expect(screen.getByText(/Score: 0\.87/)).toBeInTheDocument();
      expect(screen.getByText(/Score: 0\.75/)).toBeInTheDocument();
    });

    test('does not render empty state text when matches exist', () => {
      render(<MatchesPage />);
      expect(screen.queryByText(/No matches yet/i)).not.toBeInTheDocument();
    });
  });
});
