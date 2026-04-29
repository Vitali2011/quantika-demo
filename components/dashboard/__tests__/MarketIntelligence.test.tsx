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

  it('shows Bunker Rotterdam KPI', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/Bunker Rotterdam/i)).toBeTruthy();
  });

  it('shows EUA KPI', () => {
    render(<MarketIntelligence />);
    expect(screen.getByText(/EUA/i)).toBeTruthy();
  });

  it('shows BHSI KPI', () => {
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

  it('shows no "Loading…" text after fetch resolves (fetch success for BHSI)', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('BHSI')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            indicator: 'BHSI',
            value: 1234,
            unit: 'index',
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

    // BHSI card should now show the live value
    expect(screen.getByText('1,234')).toBeTruthy();
  });
});
