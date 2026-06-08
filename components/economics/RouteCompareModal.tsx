'use client';

/**
 * β-06 RouteCompareModal — side-by-side Suez vs Cape with LLM banner.
 * BP-04 — added "Price sources" section with PriceSourceBadge badges.
 * Closes on ESC and backdrop click.
 */

import { useEffect, useState, useCallback } from 'react';
import type { RouteCompareResult } from '@/lib/economics/route-decision';
import { PriceSourceBadge } from '@/components/economics/PriceSourceBadge';
import { DEFAULT_BUNKER_USD_PER_MT, FALLBACK_EUA_EUR_PER_TCO2 } from '@/lib/constants';

type PriceSource = {
  value: number;
  source: string;
  priceDate?: string;
  fetchedAt?: string;
  mode: 'manual' | 'auto' | 'auto-skip' | 'auto-fallback';
};

type RouteCompareResultWithSources = RouteCompareResult & {
  bunkerPriceSource?: PriceSource;
  euaPriceSource?: PriceSource;
};

interface Props {
  open: boolean;
  onClose: () => void;
  origin: string;
  destination: string;
  vessel: {
    dwt: number;
    valueUsd: number;
    speedKts: number;
    consumptionMtPerDay: number;
  };
  cargo: { quantityMt: number; freightRateUsdPerMt: number };
  marketRates?: { bunkerPriceUsdPerMt: number; euaPriceEur: number };
  bunkerPort?: string;
  bunkerGrade?: string;
  bunkerPriceManual?: number;
}

const DEFAULT_MARKET = { bunkerPriceUsdPerMt: DEFAULT_BUNKER_USD_PER_MT, euaPriceEur: FALLBACK_EUA_EUR_PER_TCO2 };

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function RouteCompareModal({
  open,
  onClose,
  origin,
  destination,
  vessel,
  cargo,
  marketRates,
  bunkerPort,
  bunkerGrade,
  bunkerPriceManual,
}: Props) {
  const [data, setData] = useState<RouteCompareResultWithSources | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompare = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        origin,
        destination,
        vessel,
        cargo,
        marketRates: marketRates ?? DEFAULT_MARKET,
      };
      // Pass bunker port/grade for auto-resolve when no manual price provided
      if (bunkerPort) body.bunkerPort = bunkerPort;
      if (bunkerGrade) body.bunkerGrade = bunkerGrade;
      if (typeof bunkerPriceManual === 'number') body.bunkerPriceManual = bunkerPriceManual;

      const res = await fetch('/api/voyage/compare-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as RouteCompareResultWithSources;
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [origin, destination, vessel, cargo, marketRates, bunkerPort, bunkerGrade, bunkerPriceManual]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await fetchCompare();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fetchCompare]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="route-compare-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Suez vs Cape comparison"
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 p-6 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            Suez vs Cape — {origin} → {destination}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {loading && <div className="text-sm text-gray-500">Calculating…</div>}
        {error && <div className="text-sm text-red-600">Error: {error}</div>}

        {data && (
          <>
            <div
              data-testid="recommendation-banner"
              className="rounded border border-blue-300 bg-blue-50 p-3 mb-4 text-sm"
            >
              <div className="font-semibold uppercase text-blue-700 mb-1">
                Recommended: {data.recommendation.route}
              </div>
              <div>{data.recommendation.reason}</div>
              <div className="text-xs text-gray-600 mt-1">
                Savings: {fmtUsd(data.recommendation.savings_usd)} ·{' '}
                {data.recommendation.savings_days} days
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {(['suez', 'cape'] as const).map((key) => {
                const leg = data[key];
                const winner = data.recommendation.route === key;
                return (
                  <div
                    key={key}
                    data-testid={`route-card-${key}`}
                    className={`rounded border p-3 text-sm ${
                      winner ? 'border-green-500 bg-green-50' : 'border-gray-300'
                    }`}
                  >
                    <div className="font-semibold capitalize mb-2">
                      {key}
                      {winner && (
                        <span className="ml-2 text-xs text-green-700">★</span>
                      )}
                    </div>
                    <Row label="Total cost" value={fmtUsd(leg.total_usd)} />
                    <Row label="Daily TCE" value={fmtUsd(leg.daily_tce_usd)} />
                    <Row label="Duration" value={`${leg.durationDays} days`} />
                    <Row label="War risk" value={fmtUsd(leg.breakdown.war_risk_usd)} />
                    <Row label="Canal" value={fmtUsd(leg.breakdown.canal_usd)} />
                    <Row label="Bunker" value={fmtUsd(leg.breakdown.bunker_usd)} />
                  </div>
                );
              })}
            </div>

            {/* BP-04: Price sources section — only rendered when API provides source data */}
            {data.bunkerPriceSource && data.euaPriceSource && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                  Price sources
                </h3>
                <div className="flex gap-3">
                  <PriceSourceBadge
                    label="Bunker"
                    value={data.bunkerPriceSource.value}
                    unit="USD/mt"
                    source={data.bunkerPriceSource.source}
                    priceDate={data.bunkerPriceSource.priceDate}
                    fetchedAt={data.bunkerPriceSource.fetchedAt}
                    mode={data.bunkerPriceSource.mode}
                  />
                  <PriceSourceBadge
                    label="EUA"
                    value={data.euaPriceSource.value}
                    unit="EUR/tCO₂"
                    source={data.euaPriceSource.source}
                    priceDate={data.euaPriceSource.priceDate}
                    fetchedAt={data.euaPriceSource.fetchedAt}
                    mode={data.euaPriceSource.mode}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
