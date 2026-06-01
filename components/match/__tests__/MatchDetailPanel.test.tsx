/**
 * @jest-environment jsdom
 *
 * TDD test for Issue #616 — React hydration error 418 on /match/[id].
 * Root cause: toLocaleString() without explicit locale in MatchDetailPanel (client component).
 * Node.js small-ICU omits thousands separators; browsers add them → text node mismatch.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MatchDetailPanel } from '../MatchDetailPanel';

jest.mock('@/lib/csrf-client', () => ({
  csrfFetch: jest.fn(),
}));

const BASE_PROPS = {
  matchDbId: 1,
  score: 82,
  status: 'open',
  loadPort: 'Hamburg',
  dischargePort: 'Rotterdam',
  cargoType: 'coal',
  vesselDwt: 75000,
  laycanDisplay: '28-31 May',
  hasSessionMatch: true,
};

describe('MatchDetailPanel — Generate Quote button visibility (#633)', () => {
  it('shows Generate Quote button when cargoEmailId is set', () => {
    render(<MatchDetailPanel {...BASE_PROPS} cargoEmailId="cargo-123" />);
    expect(screen.getByRole('button', { name: /generate quote/i })).toBeInTheDocument();
    expect(screen.queryByText(/requires session data/i)).not.toBeInTheDocument();
  });

  it('shows "Quote requires session data" when cargoEmailId is absent', () => {
    render(<MatchDetailPanel {...BASE_PROPS} />);
    expect(screen.getByText(/quote requires session data/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate quote/i })).not.toBeInTheDocument();
  });

  it('shows "Quote requires session data" when cargoEmailId is empty string', () => {
    render(<MatchDetailPanel {...BASE_PROPS} cargoEmailId="" />);
    expect(screen.getByText(/quote requires session data/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate quote/i })).not.toBeInTheDocument();
  });
});

describe('MatchDetailPanel hydration safety (#616 — DWT moved to Svodka)', () => {
  it('does NOT render DWT/MT in panel — DWT lives in server-side Svodka only', () => {
    // DWT was removed from the client panel (Key Facts declutter). It now renders
    // only in MatchWorksheet (server component) — no SSR/CSR hydration concern.
    render(<MatchDetailPanel {...BASE_PROPS} />);
    expect(screen.queryByText(/75,?000 MT/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bMT\b/)).not.toBeInTheDocument();
  });

  it('renders panel without DWT when vesselDwt is null', () => {
    render(<MatchDetailPanel {...BASE_PROPS} vesselDwt={null} />);
    expect(screen.queryByText(/MT/)).not.toBeInTheDocument();
    expect(screen.getByTestId('match-detail-panel')).toBeInTheDocument();
  });
});
