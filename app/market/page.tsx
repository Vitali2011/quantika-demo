/**
 * Market Benchmark Dashboard
 *
 * Displays BHSI, TMI, and Drewry breakbulk index charts.
 * Behind NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED flag.
 */

'use client';

import { useEffect, useState } from 'react';
import { MarketBenchmarkChart } from '@/components/market/MarketBenchmarkChart';

interface IndexData {
  index_date: string;
  value: number;
  unit: string;
  source: string;
}

export default function MarketPage() {
  const [bhsiData, setBhsiData] = useState<IndexData[] | null>(null);
  const [tmiData, setTmiData] = useState<IndexData[] | null>(null);
  const [drewryData, setDrewryData] = useState<IndexData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          // Server-side flag not enabled or service unavailable — graceful empty state
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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-900">Feature Not Enabled</h1>
          <p className="text-sm text-gray-500">
            Market benchmark dashboard is not available. Contact your administrator to enable
            NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED.
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 text-2xl font-bold">Market Benchmarks</h1>
          <p className="text-gray-500">Loading...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 text-2xl font-bold">Market Benchmarks</h1>
          <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800">
            Error: {error}
          </div>
        </div>
      </main>
    );
  }

  // Graceful empty state: API returned non-ok (503/404) — data is null
  if (bhsiData === null && tmiData === null && drewryData === null) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 text-2xl font-bold">Market Benchmarks</h1>
          <p className="text-muted-foreground text-gray-500">No market data available</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-2xl font-bold">Market Benchmarks</h1>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <MarketBenchmarkChart
            indexName="bhsi"
            data={(bhsiData ?? []).map((d) => ({ date: d.index_date, value: d.value }))}
            asOfDate={bhsiData?.[0]?.index_date}
            source={bhsiData?.[0]?.source}
            unit={bhsiData?.[0]?.unit}
          />
          <MarketBenchmarkChart
            indexName="tmi"
            data={(tmiData ?? []).map((d) => ({ date: d.index_date, value: d.value }))}
            asOfDate={tmiData?.[0]?.index_date}
            source={tmiData?.[0]?.source}
            unit={tmiData?.[0]?.unit}
          />
          <MarketBenchmarkChart
            indexName="drewry-bb"
            data={(drewryData ?? []).map((d) => ({ date: d.index_date, value: d.value }))}
            asOfDate={drewryData?.[0]?.index_date}
            source={drewryData?.[0]?.source}
            unit={drewryData?.[0]?.unit}
          />
        </div>
      </div>
    </main>
  );
}
