/**
 * @jest-environment jsdom
 *
 * Behavioral test: RoiSummaryTile renders actual ROI numbers
 * when NEXT_PUBLIC_ROI_GUARANTEE_ENABLED=true and fetch resolves.
 *
 * PI2 compliance: uses render() + waitFor() to verify DOM output,
 * not string-matching on source files.
 */
import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RoiSummaryTile } from '@/components/dashboard/RoiSummaryTile';

const DEMO_SUMMARY = {
  totalVoyages: 3,
  totalSavingsUsd: 16500,
  avgSavingsPerVoyage: 5500,
  roiMultiple: 55.56,
  cohorts: [
    { month: '2026-05', voyages: 1, totalSavings: 6000, avgSavings: 6000 },
    { month: '2026-04', voyages: 1, totalSavings: 8500, avgSavings: 8500 },
    { month: '2026-03', voyages: 1, totalSavings: 2000, avgSavings: 2000 },
  ],
};

const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(DEMO_SUMMARY),
  })
) as jest.Mock;

beforeAll(() => {
  global.fetch = mockFetch;
});

afterAll(() => {
  // @ts-expect-error restore
  delete global.fetch;
});

describe('RoiSummaryTile — numbers render (PI2 behavioral)', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED;
  });

  it('renders Total Savings dollar amount after fetch resolves', async () => {
    render(<RoiSummaryTile />);

    await waitFor(() => {
      expect(screen.getByText('$16,500')).toBeInTheDocument();
    });
  });

  it('renders ROI Multiple after fetch resolves', async () => {
    render(<RoiSummaryTile />);

    await waitFor(() => {
      expect(screen.getByText('55.56x')).toBeInTheDocument();
    });
  });

  it('renders voyage count after fetch resolves', async () => {
    render(<RoiSummaryTile />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('renders 90-Day ROI Summary heading', async () => {
    render(<RoiSummaryTile />);

    expect(screen.getByText('90-Day ROI Summary')).toBeInTheDocument();
  });

  it('calls /api/analytics/roi?days=90 when flag is enabled', async () => {
    render(<RoiSummaryTile />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/analytics/roi?days=90');
    });
  });
});
