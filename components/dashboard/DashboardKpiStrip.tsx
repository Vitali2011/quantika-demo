'use client';

import Link from 'next/link';
import { Card } from '@/design-system/primitives';
import { KpiCard } from '@/components/market/KpiCard';

interface DashboardKpiStripProps {
  openMatches: number;
  activeCargoes: number;
}

export function DashboardKpiStrip({ openMatches, activeCargoes }: DashboardKpiStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="kpi-strip">
      {/* Tile 1: Open Matches */}
      <Link
        href="/matches"
        className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
        aria-label={`${openMatches} open matches`}
      >
        <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
            Open Matches
          </p>
          <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
            {openMatches}
          </p>
          <p className="text-xs text-ds-text-subtle">Active opportunities</p>
        </Card>
      </Link>

      {/* Tile 2: Active Cargoes */}
      <Link
        href="/cargo"
        className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
        aria-label={`${activeCargoes} active cargoes`}
      >
        <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
            Active Cargoes
          </p>
          <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
            {activeCargoes}
          </p>
          <p className="text-xs text-ds-text-subtle">In pipeline</p>
        </Card>
      </Link>

      {/* Tile 3: BDI */}
      <KpiCard label="BDI" url="/api/market/baltic-kpi?code=BDI" unit="pts" />

      {/* Tile 4: HSS Med Rate */}
      <KpiCard label="HSS MED RATE" url="/api/market/benchmark?indicator=BHSI" unit="index" />
    </div>
  );
}
