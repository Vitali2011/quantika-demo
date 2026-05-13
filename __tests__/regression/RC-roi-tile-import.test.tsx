/**
 * @jest-environment jsdom
 */
/**
 * Regression: RC-roi-tile-import (F-02)
 * Guard: NEXT_PUBLIC_ROI_GUARANTEE_ENABLED controls RoiSummaryTile visibility.
 * When the flag is NOT 'true', the component must return null.
 * When flag IS 'true', the component must render (at least loading state).
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RoiSummaryTile } from '@/components/dashboard/RoiSummaryTile';

// Mock global fetch — component calls /api/analytics/roi?days=90
const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        totalVoyages: 5,
        totalSavingsUsd: 12000,
        avgSavingsPerVoyage: 2400,
        roiMultiple: 3.2,
        cohorts: [],
      }),
  })
) as jest.Mock;

beforeAll(() => {
  global.fetch = mockFetch;
});

afterAll(() => {
  // @ts-expect-error restore
  delete global.fetch;
});

describe('RC-roi-tile-import — NEXT_PUBLIC_ROI_GUARANTEE_ENABLED gate', () => {
  const originalValue = process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED = originalValue;
    }
  });

  it('roi tile is absent when NEXT_PUBLIC_ROI_GUARANTEE_ENABLED is not set', () => {
    delete process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED;
    const { container } = render(<RoiSummaryTile />);
    expect(container.firstChild).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('roi tile is absent when NEXT_PUBLIC_ROI_GUARANTEE_ENABLED=false', () => {
    process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED = 'false';
    const { container } = render(<RoiSummaryTile />);
    expect(container.firstChild).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('roi tile is present when NEXT_PUBLIC_ROI_GUARANTEE_ENABLED=true', () => {
    process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED = 'true';
    const { getByText } = render(<RoiSummaryTile />);
    // Component renders loading state immediately (before fetch resolves)
    expect(getByText('90-Day ROI Summary')).toBeInTheDocument();
  });
});
