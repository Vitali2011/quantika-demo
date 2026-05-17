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

  // Issue #177: Bunker Rotterdam, EUA, BHSI restored — backend now implemented
  // via bunker_prices, eua_prices, and market_indices DB repositories.
  it('renders Bunker Rotterdam card (issue #177 — backend implemented)', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/Bunker Rotterdam/i)).toBeTruthy();
  });

  it('renders EUA card (issue #177 — backend implemented)', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/EUA/i)).toBeTruthy();
  });

  it('renders BHSI card (issue #177 — backend implemented)', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/BHSI/i)).toBeTruthy();
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
