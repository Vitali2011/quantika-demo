'use client';

import { useEffect, useState } from 'react';
import { MarketKpiTile } from '@/components/market/MarketKpiTile';
import { MarketBenchmarkChart } from '@/components/market/MarketBenchmarkChart';
import { MetricHistoryPanel } from '@/components/market/MetricHistoryPanel';
import { RoutesSection } from '@/components/market/RoutesSection';
import { FixturesSection } from '@/components/market/FixturesSection';
import { KnowledgeFeed } from '@/components/market/KnowledgeFeed';
import { useDemoNow } from '@/lib/clock-client';

/**
 * Derives an SVG polyline path string from an ordered value array (oldest → newest).
 * Maps data onto the tile sparkline viewBox "0 0 56 18".
 * Returns '' when fewer than 2 points are available.
 */
function computeSparklinePath(values: number[]): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = +(2 + (i / (values.length - 1)) * 52).toFixed(1);
    const y = +(17 - ((v - min) / range) * 16).toFixed(1);
    return `${x} ${y}`;
  });
  return `M${points[0]} ${points.slice(1).map((p) => `L${p}`).join(' ')}`;
}

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function latestIndexDate(data: IndexData[] | null): string | null {
  if (!data || data.length === 0) return null;
  return data.reduce((best, d) => (d.index_date > best ? d.index_date : best), data[0].index_date);
}

export default function MarketPage() {
  const [bhsiData, setBhsiData] = useState<IndexData[] | null>(null);
  const [tmiData, setTmiData] = useState<IndexData[] | null>(null);
  const [drewryData, setDrewryData] = useState<IndexData[] | null>(null);
  const [bdiPeriod, setBdiPeriod] = useState<string | null>(null);
  const [tileHistories, setTileHistories] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  // Hydration-safe demo clock: 0 on SSR, frozen demo timestamp after mount.
  const now = useDemoNow();

  useEffect(() => {
    async function loadData() {
      if (process.env.NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED !== 'true') {
        setError('Market benchmark feature not enabled');
        setLoading(false);
        return;
      }

      try {
        const [bhsiRes, tmiRes, drewryRes, bdiRes] = await Promise.all([
          fetch('/api/market/indices?name=bhsi&days=30'),
          fetch('/api/market/indices?name=tmi&days=30'),
          fetch('/api/market/indices?name=drewry-bb&days=30'),
          fetch('/api/market/baltic-kpi?code=BDI'),
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

        if (bdiRes.ok) {
          const bdi = await bdiRes.json();
          setBdiPeriod(typeof bdi.period === 'string' ? bdi.period : null);
        }

        // Fetch sparkline history for all 7 KPI tiles (no flag gate for Baltic/bunker/EUA).
        const tileKeys = ['bdi', 'bci', 'bsi', 'bhsi', 'vlsfo', 'mgo', 'eua'];
        const historyResponses = await Promise.all(
          tileKeys.map((key) => fetch(`/api/market/indices?name=${key}&days=30`))
        );
        const histories: Record<string, number[]> = {};
        for (let i = 0; i < tileKeys.length; i++) {
          const res = historyResponses[i];
          if (res && res.ok) {
            const rows = (await res.json()) as IndexData[];
            // Rows come back newest-first; reverse for oldest→newest (left→right in sparkline).
            histories[tileKeys[i]!] = rows.map((r) => r.value).reverse();
          }
        }
        setTileHistories(histories);
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

  // Use the OLDEST date across all data sources: if any source is stale the label should reflect it.
  const latestDate = [latestIndexDate(bhsiData), latestIndexDate(tmiData), latestIndexDate(drewryData), bdiPeriod]
    .filter((d): d is string => d !== null)
    .sort()
    .at(0) ?? null;
  const isStale = latestDate !== null && now > 0 && now - new Date(latestDate).getTime() > MS_PER_DAY;

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
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {latestDate ? `Market data · demo snapshot as of ${latestDate}` : 'Market data · demo snapshot'}
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
                sparklinePath={computeSparklinePath(tileHistories[tile.key] ?? []) || tile.sparklinePath}
                sparklineDir={tile.sparklineDir}
                delta={tile.delta}
                isActive={activeKpi === tile.key}
                isStale={isStale}
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
                sparklinePath={computeSparklinePath(tileHistories[tile.key] ?? []) || tile.sparklinePath}
                sparklineDir={tile.sparklineDir}
                delta={tile.delta}
                isActive={activeKpi === tile.key}
                isStale={isStale}
                onClick={() => setActiveKpi(activeKpi === tile.key ? null : tile.key)}
              />
            ))}
          </div>
        </section>

        {/* Metric history side panel */}
        {activeKpi != null && (() => {
          const tile = [...BALTIC_TILES, ...COMMODITY_TILES].find((t) => t.key === activeKpi);
          return tile ? (
            <MetricHistoryPanel
              kpiKey={activeKpi}
              label={tile.label}
              unit={tile.unit}
              onClose={() => setActiveKpi(null)}
            />
          ) : null;
        })()}

        {/* Freight market index charts — BHSI, TMI, Drewry breakbulk */}
        {(bhsiData?.length || tmiData?.length || drewryData?.length) ? (
          <section aria-label="Market index charts" className="mb-10">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {bhsiData && bhsiData.length > 0 && (
                <MarketBenchmarkChart
                  indexName="bhsi"
                  data={bhsiData.map((d) => ({ date: d.index_date, value: d.value }))}
                  asOfDate={latestIndexDate(bhsiData) ?? undefined}
                  unit={bhsiData[0]?.unit}
                />
              )}
              {tmiData && tmiData.length > 0 && (
                <MarketBenchmarkChart
                  indexName="tmi"
                  data={tmiData.map((d) => ({ date: d.index_date, value: d.value }))}
                  asOfDate={latestIndexDate(tmiData) ?? undefined}
                  unit={tmiData[0]?.unit}
                />
              )}
              {drewryData && drewryData.length > 0 && (
                <MarketBenchmarkChart
                  indexName="drewry-bb"
                  data={drewryData.map((d) => ({ date: d.index_date, value: d.value }))}
                  asOfDate={latestIndexDate(drewryData) ?? undefined}
                  unit={drewryData[0]?.unit}
                />
              )}
            </div>
          </section>
        ) : null}

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
