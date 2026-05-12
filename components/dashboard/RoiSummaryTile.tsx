'use client';

import { useEffect, useState } from 'react';

interface RoiSummary {
  totalVoyages: number;
  totalSavingsUsd: number;
  avgSavingsPerVoyage: number;
  roiMultiple: number;
  cohorts: Array<{
    month: string;
    voyages: number;
    totalSavings: number;
    avgSavings: number;
  }>;
}

/**
 * ROI Summary tile for dashboard (γ-18).
 *
 * Shows Total Savings, ROI Multiple, # Voyages, 90-day cohort bars.
 * Returns null when NEXT_PUBLIC_ROI_GUARANTEE_ENABLED !== 'true'.
 */
export function RoiSummaryTile() {
  const [summary, setSummary] = useState<RoiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Feature flag check (after hooks to comply with Rules of Hooks)
  const enabled = process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED === 'true';

  useEffect(() => {
    if (!enabled) return;
    fetch('/api/analytics/roi?days=90')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setSummary(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [enabled]);

  // Return null when flag is disabled
  if (!enabled) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-2">90-Day ROI Summary</h3>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-2">90-Day ROI Summary</h3>
        <p className="text-sm text-red-500">Error: {error}</p>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const formatCurrency = (amount: number): string => {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold mb-3">90-Day ROI Summary</h3>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-500">Total Savings</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(summary.totalSavingsUsd)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">ROI Multiple</p>
          <p className="text-xl font-bold text-blue-600">{summary.roiMultiple.toFixed(2)}x</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Voyages</p>
          <p className="text-xl font-bold">{summary.totalVoyages}</p>
        </div>
      </div>

      {summary.cohorts.length > 0 && (
        <div>
          <p className="text-sm text-gray-500 mb-2">Monthly Cohorts</p>
          <div className="space-y-1">
            {summary.cohorts.map((cohort) => (
              <div key={cohort.month} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{cohort.month}</span>
                <span className="font-medium">{cohort.voyages} voyages</span>
                <span className="text-green-600">{formatCurrency(cohort.totalSavings)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.totalVoyages === 0 && (
        <p className="text-sm text-gray-500 text-center py-2">No voyages recorded in the reporting period.</p>
      )}
    </div>
  );
}
