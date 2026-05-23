/**
 * @jest-environment jsdom
 *
 * PI2 behavioral tests for MarketBenchmarkChart:
 * - #353: labels render in English (not Russian)
 * - #354: values >3x median get an outlier warning marker
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarketBenchmarkChart } from '@/components/market/MarketBenchmarkChart';

beforeAll(() => {
  process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED = 'true';
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED;
});

const normalData = [
  { date: '2026-05-01', value: 1100 },
  { date: '2026-05-02', value: 1150 },
  { date: '2026-05-03', value: 1200 },
  { date: '2026-05-04', value: 1180 },
  { date: '2026-05-05', value: 1210 },
];

describe('MarketBenchmarkChart — #353 EN labels', () => {
  it('renders "as of" (not Russian "по состоянию на") for asOfDate', () => {
    render(
      React.createElement(MarketBenchmarkChart, {
        indexName: 'tmi',
        data: normalData,
        asOfDate: '2026-05-05',
        unit: 'USD/day',
      }),
    );

    expect(screen.getByText(/as of 2026-05-05/i)).toBeInTheDocument();
    expect(screen.queryByText(/по состоянию на/i)).not.toBeInTheDocument();
  });

  it('renders "Source" (not Russian "источник") for source prop', () => {
    render(
      React.createElement(MarketBenchmarkChart, {
        indexName: 'tmi',
        data: normalData,
        source: 'https://example.com',
        unit: 'USD/day',
      }),
    );

    expect(screen.getByText(/Source/i)).toBeInTheDocument();
    expect(screen.queryByText(/источник/i)).not.toBeInTheDocument();
  });
});

describe('MarketBenchmarkChart — #354 outlier marker', () => {
  it('marks a value >3x median with outlier-marker', () => {
    // median of [1100, 1150, 1200, 1180, 12841] sorted = [1100, 1150, 1180, 1200, 12841]
    // median = 1180; threshold = 3540; 12841 > 3540 → outlier
    const spikeData = [
      { date: '2026-05-10', value: 1100 },
      { date: '2026-05-11', value: 1150 },
      { date: '2026-05-12', value: 1180 },
      { date: '2026-05-13', value: 1200 },
      { date: '2026-05-14', value: 12841 },
    ];

    render(
      React.createElement(MarketBenchmarkChart, {
        indexName: 'tmi',
        data: spikeData,
        unit: 'USD/day',
      }),
    );

    const markers = screen.getAllByTestId('outlier-marker');
    expect(markers.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT mark normal values as outliers', () => {
    render(
      React.createElement(MarketBenchmarkChart, {
        indexName: 'tmi',
        data: normalData,
        unit: 'USD/day',
      }),
    );

    expect(screen.queryByTestId('outlier-marker')).not.toBeInTheDocument();
  });

  it('outlier marker has descriptive title attribute for accessibility', () => {
    const spikeData = [
      { date: '2026-05-10', value: 1000 },
      { date: '2026-05-11', value: 1000 },
      { date: '2026-05-12', value: 1000 },
      { date: '2026-05-14', value: 9000 },
    ];

    render(
      React.createElement(MarketBenchmarkChart, {
        indexName: 'tmi',
        data: spikeData,
        unit: 'USD/day',
      }),
    );

    const marker = screen.getByTestId('outlier-marker');
    expect(marker).toHaveAttribute('title');
    expect(marker.getAttribute('title')).toMatch(/3x.*median|median.*3x/i);
  });
});
