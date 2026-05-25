'use client';

import Link from 'next/link';
import { Card } from '@/design-system/primitives';
import { useMode } from '@/design-system/patterns/useMode';
import { KpiCard } from '@/components/market/KpiCard';

interface DashboardKpiStripProps {
  openMatches: number;
  activeCargoes: number;
  activeVessels: number;
  fixtureCount?: number;
  avgTce?: number | null;
}

function fmtTce(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + (v / 1000).toFixed(1) + 'k';
}

export function DashboardKpiStrip({
  openMatches,
  activeCargoes,
  activeVessels,
  fixtureCount,
  avgTce,
}: DashboardKpiStripProps) {
  const { isOwner } = useMode();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="kpi-strip">
      {isOwner ? (
        <>
          {/* Owner tile 1: Vessels Available */}
          <Link
            href="/vessels"
            className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
            aria-label={`${activeVessels} vessels available`}
          >
            <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
                Vessels Available
              </p>
              <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
                {activeVessels}
              </p>
              <p className="text-xs text-ds-text-subtle">Open positions</p>
            </Card>
          </Link>

          {/* Owner tile 2: Fixtures Secured */}
          <Link
            href="/recap"
            className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
            aria-label={`${fixtureCount ?? 0} fixtures secured`}
          >
            <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
                Fixtures Secured
              </p>
              <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
                {fixtureCount ?? 0}
              </p>
              <p className="text-xs text-ds-text-subtle">Confirmed deals</p>
            </Card>
          </Link>

          {/* Owner tile 3: Avg TCE Earned */}
          <Link
            href="/matches"
            className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
            aria-label={`Avg TCE earned ${fmtTce(avgTce)}`}
          >
            <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
                Avg TCE Earned
              </p>
              <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
                {fmtTce(avgTce)}
              </p>
              <p className="text-xs text-ds-text-subtle">Per day, est.</p>
            </Card>
          </Link>
        </>
      ) : (
        <>
          {/* Charterer tile 1: Matches Found */}
          <Link
            href="/matches"
            className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
            aria-label={`${openMatches} open matches`}
          >
            <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
                Matches Found
              </p>
              <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
                {openMatches}
              </p>
              <p className="text-xs text-ds-text-subtle">Active opportunities</p>
            </Card>
          </Link>

          {/* Charterer tile 2: Cargo Posted */}
          <Link
            href="/cargo"
            className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
            aria-label={`${activeCargoes} cargo posted`}
          >
            <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
                Cargo Posted
              </p>
              <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
                {activeCargoes}
              </p>
              <p className="text-xs text-ds-text-subtle">In pipeline</p>
            </Card>
          </Link>

          {/* Charterer tile 3: Avg TCE Saved */}
          <Link
            href="/matches"
            className="rounded-ds-lg outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40"
            aria-label={`Avg TCE saved ${fmtTce(avgTce)}`}
          >
            <Card padding="sm" interactive className="h-full flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-ds-text-muted uppercase tracking-widest">
                Avg TCE Saved
              </p>
              <p className="text-2xl font-bold text-ds-text tabular-nums leading-tight">
                {fmtTce(avgTce)}
              </p>
              <p className="text-xs text-ds-text-subtle">Per day, est.</p>
            </Card>
          </Link>
        </>
      )}

      {/* Tile 4: Market benchmark (both modes) */}
      <KpiCard label="BHSI" url="/api/market/benchmark?indicator=BHSI" unit="index" />
    </div>
  );
}
