'use client';

import { useEffect, useState } from 'react';
import type { MarketBenchmark } from '@/lib/types';

interface KpiCard {
  label: string;
  value: string;
  unit: string;
  period: string;
}

// Cards with no backend support show "Unavailable" immediately (no fetch).
const UNAVAILABLE_KPIS: KpiCard[] = [
  { label: 'Bunker Rotterdam', value: '—', unit: 'USD/t', period: 'Unavailable' },
  { label: 'EUA EU ETS', value: '—', unit: 'EUR/t', period: 'Unavailable' },
];

interface MarketIntelligenceProps {
  noActiveDeals?: boolean;
}

export function MarketIntelligence({ noActiveDeals }: MarketIntelligenceProps) {
  const [tmiCard, setTmiCard] = useState<KpiCard>({
    label: 'Toepfer TMI',
    value: '—',
    unit: 'USD/day',
    period: 'Loading…',
  });

  const [bhsiCard, setBhsiCard] = useState<KpiCard>({
    label: 'BHSI',
    value: '—',
    unit: 'index',
    period: 'Loading…',
  });

  useEffect(() => {
    fetch('/api/market/benchmark?indicator=TOEPFER_TMI')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MarketBenchmark | null) => {
        if (data) {
          setTmiCard({
            label: 'Toepfer TMI',
            value: data.value.toLocaleString('en-US'),
            unit: data.unit,
            period: data.period,
          });
        } else {
          setTmiCard((prev) => ({ ...prev, period: 'Unavailable' }));
        }
      })
      .catch(() => {
        setTmiCard((prev) => ({ ...prev, period: 'Unavailable' }));
      });
  }, []);

  useEffect(() => {
    fetch('/api/market/benchmark?indicator=BHSI')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MarketBenchmark | null) => {
        if (data) {
          setBhsiCard({
            label: 'BHSI',
            value: data.value.toLocaleString('en-US'),
            unit: data.unit,
            period: data.period,
          });
        } else {
          setBhsiCard((prev) => ({ ...prev, period: 'Unavailable' }));
        }
      })
      .catch(() => {
        setBhsiCard((prev) => ({ ...prev, period: 'Unavailable' }));
      });
  }, []);

  const allKpis: KpiCard[] = [tmiCard, ...UNAVAILABLE_KPIS, bhsiCard];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {allKpis.map((kpi) => (
          <div key={kpi.label} className="p-3 bg-white rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.unit} · {kpi.period}</p>
          </div>
        ))}
      </div>
      {noActiveDeals && (
        <p className="text-sm text-gray-500 text-center py-2">
          No active deals yet.{' '}
          <span className="font-medium">Forward your next inquiry via WhatsApp or Gmail extension</span>{' '}
          to get started.
        </p>
      )}
    </div>
  );
}
