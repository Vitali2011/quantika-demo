'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchWithTimeout, FETCH_TIMEOUT_MS, type KpiData } from '@/components/market/KpiCard';

type SparkDir = 'up' | 'down' | 'flat';

export interface MarketKpiTileDelta {
  pct: string;
  pts: string;
  dir: SparkDir;
}

export interface MarketKpiTileProps {
  label: string;
  subLabel: string;
  url: string | null;
  unit: string;
  sparklinePath: string;
  sparklineDir: SparkDir;
  delta: MarketKpiTileDelta;
  isActive?: boolean;
  isStale?: boolean;
  onClick?: () => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DELTA_CLS: Record<SparkDir, string> = {
  up: 'bg-green-50 text-green-600 border border-green-200',
  down: 'bg-red-50 text-red-600 border border-red-200',
  flat: 'bg-slate-50 text-slate-500 border border-slate-200',
};

const SPARK_CLS: Record<SparkDir, string> = {
  up: 'text-green-600',
  down: 'text-red-600',
  flat: 'text-slate-300',
};

function DeltaArrowUp() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
      <path d="M5 2 L8 6 H2 Z" />
    </svg>
  );
}

function DeltaArrowDown() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
      <path d="M5 8 L2 4 H8 Z" />
    </svg>
  );
}

export function MarketKpiTile({
  label,
  subLabel,
  url,
  unit,
  sparklinePath,
  sparklineDir,
  delta,
  isActive = false,
  isStale = false,
  onClick,
  timeoutMs = FETCH_TIMEOUT_MS,
  fetchImpl,
}: MarketKpiTileProps) {
  const [data, setData] = useState<KpiData | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ok' | 'unavailable'>(
    url == null ? 'unavailable' : 'loading',
  );
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (url == null) return;
    let cancelled = false;
    void fetchWithTimeout<KpiData>(url, timeoutMs, fetchImpl).then((res) => {
      if (cancelled) return;
      if (res && (typeof res.value === 'number' || typeof res.value === 'string')) {
        setData(res);
        setPhase('ok');
      } else {
        setPhase('unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, timeoutMs, fetchImpl, retryNonce]);

  const onRetry = useCallback(() => {
    setPhase('loading');
    setRetryNonce((n) => n + 1);
  }, []);

  const borderCls = isActive
    ? 'border-slate-900'
    : 'border-slate-200 hover:border-slate-900';

  const valueStr =
    data != null
      ? typeof data.value === 'number'
        ? data.value.toLocaleString('en-US')
        : data.value
      : null;

  return (
    <div
      data-testid={`kpi-tile-${label.toLowerCase()}`}
      data-label={label}
      className={`bg-white rounded-2xl border-[1.5px] ${borderCls} p-5 min-h-[132px] flex flex-col gap-3 cursor-pointer transition-colors`}
      onClick={onClick}
    >
      {/* Label row + sparkline */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-slate-500">
          {label}{' '}
          <span className="normal-case tracking-normal font-normal text-slate-400">
            {subLabel}
          </span>
        </span>
        <svg
          className={`${SPARK_CLS[sparklineDir]} w-14 h-[18px] flex-shrink-0`}
          viewBox="0 0 56 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={sparklinePath} />
        </svg>
      </div>

      {/* Value */}
      <div className="flex-1">
        {phase === 'loading' && (
          <p className="text-[34px] leading-none tracking-tight font-medium text-slate-300 tabular-nums animate-pulse">
            …
          </p>
        )}
        {phase === 'ok' && valueStr != null && (
          <p className="text-[34px] leading-none tracking-tight font-medium text-slate-900 tabular-nums">
            {valueStr}
          </p>
        )}
        {phase === 'unavailable' && (
          <div>
            <p className="text-[34px] leading-none tracking-tight font-medium text-slate-300 tabular-nums">
              —
            </p>
            {url != null && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="mt-1 text-xs text-blue-600 hover:underline font-mono"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer: delta badge + period */}
      <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
        {!isStale && (
          <>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono text-[11.5px] font-medium ${DELTA_CLS[delta.dir]}`}
            >
              {delta.dir === 'up' && <DeltaArrowUp />}
              {delta.dir === 'down' && <DeltaArrowDown />}
              {delta.pct}
            </span>
            <span>24h · {delta.pts}</span>
          </>
        )}
        {isStale && <span className="text-amber-500 text-[11px]">stale data</span>}
      </div>
    </div>
  );
}

export default MarketKpiTile;
