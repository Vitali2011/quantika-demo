/**
 * @jest-environment jsdom
 *
 * TDD spec-02: Market TMI graceful empty state
 * Tests that 503/non-ok API responses → empty state (not crash/error)
 *
 * Acceptance Criteria:
 * - 503 response → "No market data available" (not throw)
 * - 404 response → same graceful empty state
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MarketPage from '@/app/market/page';

// Enable feature flag for all tests in this file
const ORIGINAL_ENV = process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED;
beforeAll(() => {
  process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED = 'true';
});
afterAll(() => {
  process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED = ORIGINAL_ENV;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MarketPage — graceful empty state on API errors', () => {
  it('shows empty state (not error crash) when API returns 503', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Service Unavailable' }),
      })
    ) as jest.Mock;

    render(React.createElement(MarketPage));

    await waitFor(() => {
      expect(screen.getByText(/no market data available/i)).toBeInTheDocument();
    });

    // Must NOT show the red error box with "Error: Failed to fetch TMI"
    expect(screen.queryByText(/error: failed to fetch/i)).not.toBeInTheDocument();
  });

  it('shows empty state (not error crash) when API returns 404', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not Found' }),
      })
    ) as jest.Mock;

    render(React.createElement(MarketPage));

    await waitFor(() => {
      expect(screen.getByText(/no market data available/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/error: failed to fetch/i)).not.toBeInTheDocument();
  });

  it('renders charts when API returns valid data', async () => {
    const mockData = [
      { index_date: '2026-05-01', value: 500, unit: 'points', source: 'test' },
      { index_date: '2026-05-02', value: 510, unit: 'points', source: 'test' },
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      })
    ) as jest.Mock;

    render(React.createElement(MarketPage));

    await waitFor(() => {
      expect(screen.getByText('Market Benchmarks')).toBeInTheDocument();
    });

    expect(screen.queryByText(/no market data available/i)).not.toBeInTheDocument();
  });
});

describe('MarketPage — sync badge staleness', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED = 'true';
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED = ORIGINAL_ENV;
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows demo snapshot badge (not Last sync / Live · synced) when data is >24h old', async () => {
    const staleDate = new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const staleData = [{ index_date: staleDate, value: 500, unit: 'points', source: 'test' }];

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(staleData) })
    ) as jest.Mock;

    render(React.createElement(MarketPage));

    await waitFor(() => {
      expect(screen.getByText(/demo snapshot/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/live · synced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last sync:/i)).not.toBeInTheDocument();
  });

  it('shows demo snapshot badge (not Live · synced) when data is <24h old', async () => {
    const freshDate = new Date().toISOString().slice(0, 10);
    const freshData = [{ index_date: freshDate, value: 500, unit: 'points', source: 'test' }];

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(freshData) })
    ) as jest.Mock;

    render(React.createElement(MarketPage));

    await waitFor(() => {
      expect(screen.getByText(/demo snapshot/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/live · synced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last sync:/i)).not.toBeInTheDocument();
  });

  it('#545 — demo snapshot shows BDI period date when BDI is older than market_indices data', async () => {
    // BDI period is 17 days old; market_indices data (bhsi/tmi/drewry) is 5 days old.
    // The demo snapshot label must show the older BDI date (min across all sources).
    const bdiDate = new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const indicesDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    global.fetch = jest.fn((url: RequestInfo | URL) => {
      const href = typeof url === 'string' ? url : url.toString();
      if (href.includes('baltic-kpi')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: 1450, unit: 'points', period: bdiDate }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([{ index_date: indicesDate, value: 500, unit: 'points', source: 'test' }]),
      });
    }) as jest.Mock;

    render(React.createElement(MarketPage));

    await waitFor(() => {
      expect(screen.getByText(/demo snapshot/i)).toBeInTheDocument();
    });

    // The label should show bdiDate, not indicesDate
    expect(screen.getByText(/demo snapshot/i).textContent).toContain(bdiDate);
    // Check badge text specifically — indicesDate may appear in chart table rows (not in the badge)
    expect(screen.getByText(/demo snapshot/i).textContent).not.toContain(indicesDate);
  });
});

describe('MarketPage — index charts show numeric values when flag enabled', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED = 'true';
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED = ORIGINAL_ENV;
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders BHSI, TMI, Drewry charts with numeric values when indices API returns data', async () => {
    const mockIndexData = [
      { index_date: '2026-05-30', value: 512, unit: 'USD/day', source: 'seed-synthetic' },
      { index_date: '2026-05-29', value: 498, unit: 'USD/day', source: 'seed-synthetic' },
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockIndexData) })
    ) as jest.Mock;

    render(React.createElement(MarketPage));

    await waitFor(() => {
      expect(screen.getByText('Market Benchmarks')).toBeInTheDocument();
    });

    // All three index chart headings must appear.
    // Use findByRole (async) so the assertion waits for the charts to render
    // past the "Loading…" state — the "Market Benchmarks" heading above is
    // present in BOTH the loading and loaded states, so waitFor on it can
    // resolve before the index charts mount, making getByRole flaky.
    expect(await screen.findByRole('heading', { name: /bhsi/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /tmi/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /drewry-bb/i })).toBeInTheDocument();

    // Numeric values from mock data must be visible (Current row shows validData[0])
    const currentLabels = screen.getAllByText(/current:/i);
    expect(currentLabels.length).toBeGreaterThanOrEqual(3);
  });
});
