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
