'use client';

import { KpiCard } from './KpiCard';

export function LiveStrip() {
  return (
    <div className="grid grid-cols-3 gap-3" role="region" aria-label="Live market data">
      <KpiCard label="BDI" url="/api/market/baltic-kpi?code=BDI" unit="pts" />
      <KpiCard label="BHSI" url="/api/market/baltic-kpi?code=BHSI" unit="pts" />
      <KpiCard label="VLSFO RTM" url="/api/market/bunker-kpi?grade=VLSFO" unit="$/mt" />
    </div>
  );
}
