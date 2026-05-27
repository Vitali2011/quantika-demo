'use client';

import { useEffect, useState } from 'react';
import { MarketBenchmarkChart } from './MarketBenchmarkChart';

interface RawRow {
  index_date: string;
  value: number;
  unit: string;
  source: string;
}

interface Props {
  kpiKey: string;
  label: string;
  unit: string;
  onClose: () => void;
}

export function MetricHistoryPanel({ kpiKey, label, unit, onClose }: Props) {
  const [result, setResult] = useState<{ key: string; data: { date: string; value: number }[] } | null>(null);
  const loading = result?.key !== kpiKey;

  useEffect(() => {
    fetch(`/api/market/indices?name=${encodeURIComponent(kpiKey)}&days=30`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RawRow[]) => {
        setResult({ key: kpiKey, data: rows.map((r) => ({ date: r.index_date, value: r.value })) });
      })
      .catch(() => {
        setResult({ key: kpiKey, data: [] });
      });
  }, [kpiKey]);

  return (
    <aside
      data-testid="metric-history-panel"
      aria-label={`${label} history`}
      className="fixed right-0 top-0 h-full w-[420px] bg-white border-l border-slate-200 shadow-xl z-40 flex flex-col"
    >
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
        <div>
          <h2 className="font-mono text-sm font-semibold tracking-wider uppercase text-slate-900">
            {label}
          </h2>
          <p className="font-mono text-xs text-slate-400 mt-0.5">{unit} · 30-day history</p>
        </div>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="rounded-full p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <svg
            viewBox="0 0 16 16"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 4L4 12M4 4l8 8" />
          </svg>
        </button>
      </header>
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-sm text-slate-400 animate-pulse">Loading…</p>
        ) : (
          <MarketBenchmarkChart indexName={label} data={result?.data ?? []} unit={unit} />
        )}
      </div>
    </aside>
  );
}
