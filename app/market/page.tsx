'use client';

import { useEffect, useState } from 'react';
import { MarketKpiTile } from '@/components/market/MarketKpiTile';
import { RoutesSection } from '@/components/market/RoutesSection';
import { FixturesSection } from '@/components/market/FixturesSection';
import { KnowledgeFeed } from '@/components/market/KnowledgeFeed';

interface IndexData {
  index_date: string;
  value: number;
  unit: string;
  source: string;
}

const BALTIC_TILES = [
  {
    key: 'bdi',
    label: 'BDI',
    subLabel: 'composite',
    url: '/api/market/baltic-kpi?code=BDI',
    unit: 'points',
    sparklinePath: 'M2 13 L10 11 L17 12 L24 8 L31 9 L38 6 L46 5 L54 3',
    sparklineDir: 'up' as const,
    delta: { pct: '+1.2%', pts: '+22 pts', dir: 'up' as const },
  },
  {
    key: 'bci',
    label: 'BCI',
    subLabel: 'Capesize',
    url: '/api/market/baltic-kpi?code=BCI',
    unit: 'points',
    sparklinePath: 'M2 14 L10 12 L17 13 L24 9 L31 7 L38 8 L46 5 L54 2',
    sparklineDir: 'up' as const,
    delta: { pct: '+2.4%', pts: '+50 pts', dir: 'up' as const },
  },
  {
    key: 'bsi',
    label: 'BSI',
    subLabel: 'Supramax',
    url: '/api/market/baltic-kpi?code=BSI',
    unit: 'points',
    sparklinePath: 'M2 12 L10 10 L17 11 L24 9 L31 10 L38 7 L46 8 L54 5',
    sparklineDir: 'up' as const,
    delta: { pct: '+0.8%', pts: '+12 pts', dir: 'up' as const },
  },
  {
    key: 'bhsi',
    label: 'BHSI',
    subLabel: 'Handysize',
    url: '/api/market/baltic-kpi?code=BHSI',
    unit: 'points',
    sparklinePath: 'M2 6 L10 7 L17 5 L24 8 L31 7 L38 10 L46 11 L54 13',
    sparklineDir: 'down' as const,
    delta: { pct: '−0.5%', pts: '−8 pts', dir: 'down' as const },
  },
] as const;

const COMMODITY_TILES = [
  {
    key: 'vlsfo',
    label: 'VLSFO',
    subLabel: 'Rotterdam',
    url: '/api/market/bunker-kpi?grade=VLSFO',
    unit: 'USD/mt',
    sparklinePath: 'M2 10 L10 9 L17 11 L24 8 L31 9 L38 7 L46 8 L54 6',
    sparklineDir: 'up' as const,
    delta: { pct: '+0.5%', pts: '+4 $/mt', dir: 'up' as const },
  },
  {
    key: 'mgo',
    label: 'MGO',
    subLabel: 'Rotterdam',
    url: '/api/market/bunker-kpi?grade=MGO',
    unit: 'USD/mt',
    sparklinePath: 'M2 8 L10 9 L17 7 L24 10 L31 8 L38 11 L46 9 L54 12',
    sparklineDir: 'down' as const,
    delta: { pct: '−0.3%', pts: '−4 $/mt', dir: 'down' as const },
  },
  {
    key: 'eua',
    label: 'EUA',
    subLabel: 'carbon · spot',
    url: '/api/market/eua-kpi',
    unit: '€/tCO₂',
    sparklinePath: 'M2 12 L10 10 L17 9 L24 11 L31 8 L38 7 L46 6 L54 4',
    sparklineDir: 'up' as const,
    delta: { pct: '+1.8%', pts: '+1.3 €', dir: 'up' as const },
  },
] as const;

export default function MarketPage() {
  const [bhsiData, setBhsiData] = useState<IndexData[] | null>(null);
  const [tmiData, setTmiData] = useState<IndexData[] | null>(null);
  const [drewryData, setDrewryData] = useState<IndexData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED !== 'true') {
        setError('Market benchmark feature not enabled');
        setLoading(false);
        return;
      }

      try {
        const [bhsiRes, tmiRes, drewryRes] = await Promise.all([
          fetch('/api/market/indices?name=bhsi&days=30'),
          fetch('/api/market/indices?name=tmi&days=30'),
          fetch('/api/market/indices?name=drewry-bb&days=30'),
        ]);

        if (!bhsiRes.ok || !tmiRes.ok || !drewryRes.ok) {
          setBhsiData(null);
          setTmiData(null);
          setDrewryData(null);
          setLoading(false);
          return;
        }

        const [bhsi, tmi, drewry] = await Promise.all([
          bhsiRes.json(),
          tmiRes.json(),
          drewryRes.json(),
        ]);

        setBhsiData(bhsi);
        setTmiData(tmi);
        setDrewryData(drewry);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED !== 'true') {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-bold text-slate-900">Feature Not Enabled</h1>
          <p className="text-sm text-slate-500">
            Market benchmark dashboard is not available. Contact your administrator to enable
            NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED.
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 text-2xl font-bold">Market Benchmarks</h1>
          <p className="text-slate-500">Loading…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 text-2xl font-bold">Market Benchmarks</h1>
          <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800">
            Error: {error}
          </div>
        </div>
      </main>
    );
  }

  if (bhsiData === null && tmiData === null && drewryData === null) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 text-2xl font-bold">Market Benchmarks</h1>
          <p className="text-slate-500">No market data available</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-16 pb-16">
        {/* Page header */}
        <header className="flex items-end justify-between py-12 pb-7">
          <div>
            <h1 className="text-4xl font-medium tracking-tight text-slate-900 leading-none mb-2">
              Market Benchmarks
            </h1>
            <p className="font-mono text-[12.5px] text-slate-500">
              Baltic Exchange close
              <span className="text-slate-300 mx-2">·</span>
              <span className="text-slate-900">London 16:30 GMT</span>
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-widest text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
            Live · synced
          </div>
        </header>

        {/* KPI Strip — Baltic indices + bunker + EUA */}
        <section aria-label="Market KPIs" className="mb-10 space-y-3">
          <div className="grid grid-cols-4 gap-4">
            {BALTIC_TILES.map((tile) => (
              <MarketKpiTile
                key={tile.key}
                label={tile.label}
                subLabel={tile.subLabel}
                url={tile.url}
                unit={tile.unit}
                sparklinePath={tile.sparklinePath}
                sparklineDir={tile.sparklineDir}
                delta={tile.delta}
                isActive={activeKpi === tile.key}
                onClick={() => setActiveKpi(activeKpi === tile.key ? null : tile.key)}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {COMMODITY_TILES.map((tile) => (
              <MarketKpiTile
                key={tile.key}
                label={tile.label}
                subLabel={tile.subLabel}
                url={tile.url}
                unit={tile.unit}
                sparklinePath={tile.sparklinePath}
                sparklineDir={tile.sparklineDir}
                delta={tile.delta}
                isActive={activeKpi === tile.key}
                onClick={() => setActiveKpi(activeKpi === tile.key ? null : tile.key)}
              />
            ))}
          </div>
        </section>

        {/* TODO: drill-down chart for activeKpi — future feature */}

        {/* Routes section */}
        <RoutesSection />

        {/* Recent fixtures + Knowledge feed — 2-col grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FixturesSection />
          <KnowledgeFeed />
        </div>
      </div>
    </main>
  );
}
