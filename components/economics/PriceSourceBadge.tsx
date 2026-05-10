'use client';
import { useMemo } from 'react';

interface Props {
  label: string;
  value: number;
  unit: string;
  source: string;
  priceDate?: string;
  fetchedAt?: string;
  mode: 'manual' | 'auto' | 'auto-skip' | 'auto-fallback';
}

function ageDays(priceDate?: string): number | null {
  if (!priceDate) return null;
  const ms = Date.now() - new Date(priceDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function PriceSourceBadge(p: Props) {
  const age = useMemo(() => ageDays(p.priceDate), [p.priceDate]);

  let borderColor = 'border-gray-300';
  let warning: string | null = null;

  if (p.mode === 'auto') {
    if (age !== null && age > 30) {
      borderColor = 'border-red-500';
      warning = `Stale price (${age} days old)`;
    } else if (age !== null && age > 7) {
      borderColor = 'border-yellow-500';
      warning = `Price is ${age} days old`;
    } else {
      borderColor = 'border-green-500';
    }
  } else if (p.mode === 'auto-fallback') {
    borderColor = 'border-red-500';
    warning = 'EUA price unavailable — using 0';
  }
  // manual and auto-skip → default border-gray-300

  const modeLabel: Record<string, string> = {
    manual: 'manual',
    auto: p.source,
    'auto-skip': 'not applicable',
    'auto-fallback': 'unavailable',
  };

  return (
    <div
      className={`border-2 ${borderColor} rounded p-2`}
      data-testid={`price-source-${p.label}`}
    >
      <div className="text-xs text-gray-500">{p.label}</div>
      <div className="font-semibold">
        {p.value.toFixed(2)} {p.unit}
      </div>
      <div className="text-xs">
        source: {modeLabel[p.mode] ?? p.source}
        {p.priceDate ? ` (${p.priceDate})` : ''}
      </div>
      {warning && (
        <div className="text-xs text-red-600 font-medium">{warning}</div>
      )}
    </div>
  );
}
