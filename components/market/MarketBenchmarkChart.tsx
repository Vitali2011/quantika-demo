/**
 * MarketBenchmarkChart.tsx
 *
 * Simple chart component for market indices (BHSI, TMI, Drewry).
 * Table fallback (no recharts dependency).
 * Behind NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED flag.
 */

'use client';

import * as React from 'react';

interface DataPoint {
  date: string;
  value: number;
}

interface Props {
  indexName: string;
  data: DataPoint[];
  /** Most recent index_date for the "as of" label (YYYY-MM-DD). */
  asOfDate?: string;
  /** Source URL or identifier shown below the title. */
  source?: string;
  /** Unit label, e.g. "USD/day" or "USD/FEU". */
  unit?: string;
}

export function MarketBenchmarkChart({ indexName, data, asOfDate, source, unit }: Props) {
  // Feature flag check
  if (process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED !== 'true') {
    return null;
  }

  // Boundary: empty data
  if (!data || data.length === 0) {
    return (
      <div className="rounded border border-gray-200 p-4">
        <h3 className="mb-2 text-lg font-semibold">{indexName}</h3>
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  // Filter out invalid items (boundary check)
  const validData = data.filter(
    (item) => item.date && Number.isFinite(item.value) && item.value >= 0,
  );

  if (validData.length === 0) {
    return (
      <div className="rounded border border-gray-200 p-4">
        <h3 className="mb-2 text-lg font-semibold">{indexName}</h3>
        <p className="text-sm text-gray-500">No valid data available</p>
      </div>
    );
  }

  const maxValue = Math.max(...validData.map((d) => d.value));
  const minValue = Math.min(...validData.map((d) => d.value));

  const sorted = validData.map((d) => d.value).slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const outlierThreshold = median * 3;

  return (
    <div className="rounded border border-gray-200 p-4">
      <h3 className="mb-1 text-lg font-semibold">{indexName.toUpperCase()}</h3>
      {(asOfDate || source || unit) && (
        <p className="mb-3 text-xs text-gray-500">
          {unit && <span>{unit}</span>}
          {asOfDate && (
            <span>
              {unit ? ' · ' : ''}as of {asOfDate}
            </span>
          )}
          {source && (
            <span title={source}>
              {(unit || asOfDate) ? ' · ' : ''}Source
            </span>
          )}
        </p>
      )}

      <div className="mb-4 flex gap-4 text-sm">
        <div>
          <span className="text-gray-500">Current: </span>
          <strong>{validData[0].value.toFixed(2)}</strong>
        </div>
        <div>
          <span className="text-gray-500">Min: </span>
          <strong>{minValue.toFixed(2)}</strong>
        </div>
        <div>
          <span className="text-gray-500">Max: </span>
          <strong>{maxValue.toFixed(2)}</strong>
        </div>
      </div>

      <div className="max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Date</th>
              <th className="px-2 py-1 text-right font-medium">Value</th>
              <th className="w-1/2 px-2 py-1 text-left font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {validData
              .slice()
              .reverse()
              .map((item, idx) => {
                const pct = ((item.value - minValue) / (maxValue - minValue || 1)) * 100;
                const isOutlier = median > 0 && item.value > outlierThreshold;
                return (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-2 py-1 text-gray-600">{item.date}</td>
                    <td className="px-2 py-1 text-right font-mono">
                      {item.value.toFixed(2)}
                      {isOutlier && (
                        <span
                          className="ml-1 text-amber-500"
                          title="Value is more than 3x the median — possible data anomaly"
                          data-testid="outlier-marker"
                        >
                          &#9888;
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <div className="h-2 w-full rounded bg-gray-100">
                        <div
                          className="h-full rounded bg-blue-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
