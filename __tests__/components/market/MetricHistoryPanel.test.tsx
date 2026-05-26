/**
 * @jest-environment jsdom
 *
 * PI2 behavioral tests for MetricHistoryPanel (#529):
 * - panel renders when kpiKey is provided
 * - fetches /api/market/indices with the correct kpiKey
 * - chart data appears after fetch resolves
 * - close button calls onClose
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MetricHistoryPanel } from '@/components/market/MetricHistoryPanel';

beforeAll(() => {
  process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED = 'true';
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED;
});

const mockRows = [
  { index_date: '2026-05-10', value: 1200, unit: 'points', source: 'baltic' },
  { index_date: '2026-05-09', value: 1180, unit: 'points', source: 'baltic' },
  { index_date: '2026-05-08', value: 1150, unit: 'points', source: 'baltic' },
];

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockRows,
  } as unknown as Response);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MetricHistoryPanel — #529 panel visible + chart', () => {
  it('renders panel with label and close button immediately', () => {
    render(
      <MetricHistoryPanel kpiKey="bdi" label="BDI" unit="points" onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('metric-history-panel')).toBeInTheDocument();
    expect(screen.getByText('BDI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close panel/i })).toBeInTheDocument();
  });

  it('fetches /api/market/indices?name=bdi&days=30 and renders chart data', async () => {
    render(
      <MetricHistoryPanel kpiKey="bdi" label="BDI" unit="points" onClose={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Current:')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/market/indices?name=bdi&days=30');
    // #544: when API returns rows, panel must NOT show "No data available"
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(
      <MetricHistoryPanel kpiKey="bdi" label="BDI" unit="points" onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when kpiKey changes', async () => {
    const { rerender } = render(
      <MetricHistoryPanel kpiKey="bdi" label="BDI" unit="points" onClose={jest.fn()} />,
    );

    await waitFor(() => expect(screen.getByText('Current:')).toBeInTheDocument());

    rerender(
      <MetricHistoryPanel kpiKey="bhsi" label="BHSI" unit="points" onClose={jest.fn()} />,
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/market/indices?name=bhsi&days=30'),
    );
  });
});
