'use client';

import { KpiCard } from './KpiCard';

export function LiveStrip() {
  return (
    <div className="space-y-1.5" role="region" aria-label="Market data">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="BDI" url="/api/market/baltic-kpi?code=BDI" unit="pts" />
        <KpiCard label="BHSI" url="/api/market/baltic-kpi?code=BHSI" unit="pts" />
        <KpiCard label="VLSFO RTM" url="/api/market/bunker-kpi?grade=VLSFO" unit="$/mt" />
      </div>
      <p className="text-[10px] font-mono text-slate-400 text-right tracking-wide">demo snapshot</p>
    </div>
  );
}
