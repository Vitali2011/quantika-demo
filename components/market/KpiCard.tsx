'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

export const FETCH_TIMEOUT_MS = 5000;

/** Fetch with abort-on-timeout. Returns null on timeout / non-OK / network error. */
export async function fetchWithTimeout<T>(
  url: string,
  ms: number,
  fetchImpl?: typeof fetch,
): Promise<T | null> {
  const f = fetchImpl ?? fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await f(url, { signal: ctl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface KpiData {
  value: number | string;
  unit: string;
  period: string;
}

export interface KpiCardProps {
  label: string;
  /** URL to fetch — pass `null` to render an "Unavailable" placeholder with no fetch. */
  url: string | null;
  /** Fallback unit shown in the Unavailable state. */
  unit: string;
  timeoutMs?: number;
  /** Test seam. */
  fetchImpl?: typeof fetch;
}

export function UnavailableState({
  label,
  unit,
  onRetry,
}: {
  label: string;
  unit: string;
  onRetry?: () => void;
}) {
  return (
    <div
      data-testid="kpi-unavailable"
      data-label={label}
      className="p-3 bg-gray-50 rounded-lg border border-gray-200"
    >
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-400 mt-1 tabular-nums">—</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{unit} · Unavailable</p>
        {onRetry ? (
          <button
            type="button"
            data-testid="kpi-retry"
            onClick={onRetry}
            className="text-xs text-blue-600 hover:underline"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * KPI card with hard 5s fetch timeout. Never shows an indefinite spinner: a
 * timeout, non-OK response, or thrown error always degrades to UnavailableState.
 */
export function KpiCard({
  label,
  url,
  unit,
  timeoutMs = FETCH_TIMEOUT_MS,
  fetchImpl,
}: KpiCardProps) {
  const [data, setData] = useState<KpiData | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ok' | 'unavailable'>(
    url == null ? 'unavailable' : 'loading',
  );
  const [retryNonce, setRetryNonce] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (url == null) return;
    cancelledRef.current = false;
    void fetchWithTimeout<KpiData>(url, timeoutMs, fetchImpl).then((res) => {
      if (cancelledRef.current) return;
      if (res && (typeof res.value === 'number' || typeof res.value === 'string')) {
        setData(res);
        setPhase('ok');
      } else {
        setPhase('unavailable');
      }
    });
    return () => {
      cancelledRef.current = true;
    };
  }, [url, timeoutMs, fetchImpl, retryNonce]);

  const onRetry = useCallback(() => {
    setPhase('loading');
    setRetryNonce((n) => n + 1);
  }, []);

  if (phase === 'loading') {
    return (
      <div
        data-testid="kpi-spinner"
        data-label={label}
        className="p-3 bg-white rounded-lg border border-gray-200"
      >
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-300 mt-1 tabular-nums animate-pulse">…</p>
        <p className="text-xs text-gray-400">{unit} · Loading…</p>
      </div>
    );
  }

  if (phase === 'unavailable' || !data) {
    return <UnavailableState label={label} unit={unit} onRetry={url ? onRetry : undefined} />;
  }

  const valueStr =
    typeof data.value === 'number' ? data.value.toLocaleString('en-US') : data.value;

  return (
    <div
      data-testid="kpi-ok"
      data-label={label}
      className="p-3 bg-white rounded-lg border border-gray-200"
    >
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{valueStr}</p>
      <p className="text-xs text-gray-400">
        {data.unit} · {data.period}
      </p>
    </div>
  );
}

export default KpiCard;
