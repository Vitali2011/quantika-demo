'use client';

import Link from 'next/link';
import { Card } from '@/design-system/primitives';
import { useMode } from '@/design-system/patterns/useMode';
import { KpiCard } from '@/components/market/KpiCard';

interface DashboardKpiStripProps {
  openMatches: number;
  activeCargoes: number;
  activeVessels: number;
}

export function DashboardKpiStrip({
  openMatches,
  activeCargoes,
  activeVessels,
}: DashboardKpiStripProps) {
  const { isOwner } = useMode();
  const activityCount = isOwner ? activeVessels : activeCargoes;
  const activityLabel = isOwner ? 'Active Vessels' : 'Active Cargoes';
  const activityHref = isOwner ? '/vessels' : '/cargo';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="kpi-strip">
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

      <Link
        href={activityHref}
        className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
        aria-label={`${activityCount} ${activityLabel.toLowerCase()}`}
      >
        <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
            {activityLabel}
          </p>
          <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
            {activityCount}
          </p>
          <p className="text-xs text-ds-text-subtle">In pipeline</p>
        </Card>
      </Link>

      {/* TODO: wire BDI endpoint — using BHSI (Baltic Handysize Index) as proxy */}
      <KpiCard label="BHSI" url="/api/market/benchmark?indicator=BHSI" unit="index" />

      {/* TODO: wire HSS Med rate endpoint — using Toepfer TMI as Mediterranean rate proxy */}
      <KpiCard label="HSS Med" url="/api/market/benchmark?indicator=TOEPFER_TMI" unit="USD/day" />
    </div>
  );
}
