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

describe('MatchDetailPanel hydration safety (#616)', () => {
  it('renders DWT with stable locale formatting (guards SSR/CSR hydration mismatch)', () => {
    // Simulate Node.js small-ICU behavior: toLocaleString() without an explicit locale
    // returns bare digits with no thousands separator. Browsers add "," → React error 418.
    const origFn = Number.prototype.toLocaleString;
    jest.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
      this: number,
      ...args: Parameters<typeof origFn>
    ) {
      if (!args[0]) return String(this); // mimic small-ICU Node: no separator
      return origFn.apply(this, args);
    });

    render(<MatchDetailPanel {...BASE_PROPS} />);

    // Without fix (no locale): renders "75000 MT" — test fails, exposing hydration bug.
    // After fix (locale='en-US'): renders "75,000 MT" — test passes.
    expect(screen.getByText(/75,000 MT/)).toBeInTheDocument();

    jest.restoreAllMocks();
  });

  it('renders panel without DWT when vesselDwt is null', () => {
    render(<MatchDetailPanel {...BASE_PROPS} vesselDwt={null} />);
    expect(screen.queryByText(/MT/)).not.toBeInTheDocument();
    expect(screen.getByTestId('match-detail-panel')).toBeInTheDocument();
  });
});
