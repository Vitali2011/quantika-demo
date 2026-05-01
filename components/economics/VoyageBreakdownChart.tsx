/**
 * β-05 Voyage TCE Breakdown — stacked progress-bar visualisation.
 *
 * Lightweight CSS-only stack (no recharts dependency). Each cost segment is
 * sized proportionally to total_costs_usd; tooltip on hover shows USD.
 */

import * as React from 'react';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';

interface Props {
  breakdown: TCEBreakdown;
}

const SEGMENTS: Array<{ key: keyof TCEBreakdown; label: string; color: string }> = [
  { key: 'bunker_usd', label: 'Bunker', color: '#1e3a8a' },
  { key: 'canal_usd', label: 'Canal', color: '#0e7490' },
  { key: 'da_usd', label: 'Disbursement', color: '#9333ea' },
  { key: 'war_risk_usd', label: 'War Risk', color: '#dc2626' },
  { key: 'ets_usd', label: 'EU ETS', color: '#16a34a' },
];

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export function VoyageBreakdownChart({ breakdown }: Props) {
  const total = Math.max(1, breakdown.total_costs_usd);

  return (
    <div data-testid="voyage-breakdown-chart" className="space-y-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Voyage Cost Breakdown</span>
        <span className="text-gray-600">
          Daily TCE: <strong>{fmtUsd(breakdown.daily_tce_usd)}</strong>
        </span>
      </div>

      <div
        role="img"
        aria-label={`Voyage cost breakdown, total ${fmtUsd(breakdown.total_costs_usd)}`}
        className="flex h-6 w-full overflow-hidden rounded bg-gray-100"
      >
        {SEGMENTS.map((seg) => {
          const value = breakdown[seg.key] as number;
          if (!value || value <= 0) return null;
          const pct = (value / total) * 100;
          return (
            <div
              key={seg.key}
              data-testid={`segment-${seg.key}`}
              title={`${seg.label}: ${fmtUsd(value)}`}
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              className="h-full"
            />
          );
        })}
      </div>

      <ul className="grid grid-cols-2 gap-1 text-xs text-gray-700 sm:grid-cols-3">
        {SEGMENTS.map((seg) => (
          <li key={seg.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: seg.color }}
            />
            <span>
              {seg.label}: {fmtUsd(breakdown[seg.key] as number)}
            </span>
          </li>
        ))}
        <li className="col-span-2 sm:col-span-3 border-t pt-1 font-semibold">
          Total Costs: {fmtUsd(breakdown.total_costs_usd)} · Net Voyage:{' '}
          {fmtUsd(breakdown.net_voyage_usd)}
        </li>
      </ul>
    </div>
  );
}

export default VoyageBreakdownChart;
