/**
 * @jest-environment jsdom
 *
 * PI2 — #360: benchmark source link must not navigate to /match/static-seed (404).
 * When sourceUrl is a non-HTTP value (e.g. 'static-seed'), no anchor should render.
 * When sourceUrl is a real HTTP URL, the anchor renders with the correct href.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QuoteTab } from '@/components/match/QuoteTab';

function mockFetch(sourceUrl: string) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      indicator: 'TOEPFER_TMI',
      value: 12683,
      unit: 'USD/day',
      period: '2026-05-09',
      sourceUrl,
      fetchedAt: new Date().toISOString(),
    }),
  } as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QuoteTab benchmark source link (PI2 — #360)', () => {
  it('does NOT render an anchor when sourceUrl is "static-seed"', async () => {
    mockFetch('static-seed');
    render(<QuoteTab />);

    await waitFor(() => {
      expect(screen.queryByText('source')).not.toBeInTheDocument();
    });
  });

  it('does NOT render an anchor when sourceUrl is a relative path', async () => {
    mockFetch('/some/relative/path');
    render(<QuoteTab />);

    await waitFor(() => {
      expect(screen.queryByText('source')).not.toBeInTheDocument();
    });
  });

  it('renders anchor with correct href when sourceUrl is a valid https URL', async () => {
    const realUrl = 'https://heavyliftpfi.com/market-data/';
    mockFetch(realUrl);
    render(<QuoteTab />);

    await waitFor(() => {
      const link = screen.getByText('source');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', realUrl);
    });
  });
});
