'use client';

import { KpiCard } from '@/components/market/KpiCard';

interface MarketIntelligenceProps {
  noActiveDeals?: boolean;
}

/**
 * Market KPI strip on the dashboard.
 *
 * Each card uses {@link KpiCard} which enforces a 5s fetch timeout and
 * gracefully degrades to an "Unavailable" state with a Retry button instead
 * of spinning forever (closes Wave-α E2E finding "Market KPIs Loading forever").
 *
 * Bunker / EUA cards have no backend yet → `url=null` → render Unavailable
 * immediately, no network call.
 */
export function MarketIntelligence({ noActiveDeals }: MarketIntelligenceProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Toepfer TMI"
          url="/api/market/benchmark?indicator=TOEPFER_TMI"
          unit="USD/day"
        />
        <KpiCard label="Bunker Rotterdam" url={null} unit="USD/t" />
        <KpiCard label="EUA EU ETS" url={null} unit="EUR/t" />
        <KpiCard label="BHSI" url="/api/market/benchmark?indicator=BHSI" unit="index" />
      </div>
      {noActiveDeals && (
        <p className="text-sm text-gray-500 text-center py-2">
          No active deals yet.{' '}
          <span className="font-medium">
            Forward your next inquiry via WhatsApp or Gmail extension
          </span>{' '}
          to get started.
        </p>
      )}
    </div>
  );
}
