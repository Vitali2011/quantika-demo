'use client';
import type { DataTier } from '@/lib/data-quality/types';

interface Props {
  tier: DataTier;
  asOf?: string;
}

function formatDayMonth(asOf: string): string {
  const d = new Date(asOf);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}`;
}

export function DataQualityBadge({ tier, asOf }: Props) {
  if (tier === 'live') return null;

  if (tier === 'estimated') {
    return (
      <span
        data-testid="data-quality-badge"
        className="text-xs text-amber-600"
      >
        (est.)
      </span>
    );
  }

  // stale
  const dateStr = asOf ? ` · ${formatDayMonth(asOf)}` : '';
  return (
    <span
      data-testid="data-quality-badge"
      className="text-xs text-red-600"
    >
      {`(stale${dateStr})`}
    </span>
  );
}
