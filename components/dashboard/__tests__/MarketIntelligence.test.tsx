/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MarketIntelligence } from '../MarketIntelligence';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
  } as unknown as Response);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('MarketIntelligence', () => {
  it('renders without crashing', () => {
    const { container } = render(<MarketIntelligence />);
    expect(container).not.toBeNull();
  });

  it('shows Toepfer TMI KPI', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/Toepfer TMI/i)).toBeTruthy();
  });

  // γ-cleanup-4 F2: Bunker Rotterdam, EUA, BHSI cards removed —
  // backend not implemented (url=null placeholders / 503-only).
  // Negative-contract tests guard against re-introduction without backend fix.
  it('does NOT render Bunker Rotterdam (γ-cleanup-4 F2 — removed pending backend)', () => {
    render(<MarketIntelligence />);
    expect(screen.queryByText(/Bunker Rotterdam/i)).toBeNull();
  });

  it('does NOT render EUA (γ-cleanup-4 F2 — removed pending backend)', () => {
    render(<MarketIntelligence />);
    expect(screen.queryByText(/EUA/i)).toBeNull();
  });

  it('does NOT render BHSI (γ-cleanup-4 F2 — removed pending backend)', () => {
    render(<MarketIntelligence />);
    expect(screen.queryByText(/BHSI/i)).toBeNull();
  });

  it('shows empty-state suggestion when no active deals', () => {
    render(<MarketIntelligence noActiveDeals />);
    expect(screen.getByText(/WhatsApp|Gmail/i)).toBeTruthy();
  });

  // F7 regression: no card should remain "Loading…" forever after fetch settles
  it('shows no "Loading…" text after fetch resolves (fetch failure → Unavailable)', async () => {
    await act(async () => {
      render(<MarketIntelligence />);
    });
    // flush microtasks so all useEffect fetch promises resolve
    await act(async () => {});
    const loadingEls = screen.queryAllByText(/Loading…/);
    expect(loadingEls).toHaveLength(0);
  });

  it('shows no "Loading…" text after fetch resolves (fetch success for Toepfer TMI)', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('TOEPFER_TMI')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            indicator: 'TOEPFER_TMI',
            value: 1234,
            unit: 'USD/day',
            period: 'Apr 2026',
            sourceUrl: 'https://example.com',
            fetchedAt: new Date().toISOString(),
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    await act(async () => {
      render(<MarketIntelligence />);
    });
    await act(async () => {});

    const loadingEls = screen.queryAllByText(/Loading…/);
    expect(loadingEls).toHaveLength(0);

    // Toepfer TMI card should now show the live value
    expect(screen.getByText('1,234')).toBeTruthy();
  });
});
