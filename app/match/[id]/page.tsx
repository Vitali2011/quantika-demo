import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { getMatch, getMatchBySlug } from '@/lib/matching/matches-repository';
import { fromMatchSlug } from '@/lib/matching/match-slug';
import { fmtLaycan } from '@/lib/utils/fmt-laycan';
import { Badge } from '@/components/ui/badge';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { MatchTabs } from '@/components/match/MatchTabs';
import { SourceAttributionSection } from '@/components/match/SourceAttributionSection';
import { ExplainDealModal } from '@/components/match/ExplainDealModal';
import { MatchDetailPanel, MatchDetailMobileSheet } from '@/components/match/MatchDetailPanel';

interface Props { params: Promise<{ id: string }>; }

const MATCH_LEVEL_BADGE: Record<string, { label: string }> = {
  good:     { label: 'Good Match' },
  possible: { label: 'Possible Match' },
  weak:     { label: 'Weak Match' },
};

export default async function MatchDetailPage({ params }: Props) {
  const { id } = await params;

  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/dashboard');
  const session = getSession(sessionId);
  if (!session) redirect('/dashboard');

  const db = getStore().getDatabase();
  let storedMatch;

  if (/^\d+$/.test(id)) {
    const dbId = parseInt(id, 10);
    if (dbId < 1) notFound();
    storedMatch = getMatch(db, dbId);
  } else {
    const keys = fromMatchSlug(id);
    if (!keys) notFound();
    storedMatch = getMatchBySlug(db, keys.cargo_id, keys.vessel_id, sessionId);
  }

  // Session isolation: 404 if match not found or belongs to another session
  if (!storedMatch || storedMatch.user_id !== sessionId) notFound();

  // Enrich with in-session data if still available (session may have expired/reloaded)
  const sessionMatch = session.matches.find(
    (m) => m.cargoEmailId === storedMatch.cargo_id && m.vesselEmailId === storedMatch.vessel_id,
  );
  const cargo = sessionMatch
    ? session.parsedCargos.find(
        (c) => c.emailId === sessionMatch.cargoEmailId && c.itemIndex === sessionMatch.cargoItemIndex,
      )
    : undefined;
  const vessel = sessionMatch
    ? session.parsedVessels.find(
        (v) => v.emailId === sessionMatch.vesselEmailId && v.itemIndex === sessionMatch.vesselItemIndex,
      )
    : undefined;
  const cargoEmail = sessionMatch
    ? session.emails.find((e) => e.id === sessionMatch.cargoEmailId)
    : undefined;

  const badgeCfg = sessionMatch
    ? (MATCH_LEVEL_BADGE[sessionMatch.matchLevel] ?? MATCH_LEVEL_BADGE.possible)
    : null;

  const laycanDisplay = (storedMatch.laycan_start || storedMatch.laycan_end)
    ? fmtLaycan(storedMatch.laycan_start, storedMatch.laycan_end)
    : null;

  const routeMeta = [storedMatch.load_port, storedMatch.discharge_port]
    .filter(Boolean)
    .join(' → ');
  const subMeta = [
    storedMatch.cargo_type,
    storedMatch.vessel_dwt ? `${storedMatch.vessel_dwt.toLocaleString()} DWT` : null,
    laycanDisplay,
  ].filter(Boolean).join(' · ');

  // Use sessionMatch.cargoEmailId when available; fall back to storedMatch.cargo_id
  // when sessionMatch was found but its cargoEmailId is empty (LLM returned null IDs —
  // pair-analyzer bug guard) or when storedMatch.cargo_id was the canonical ID all along.
  const effectiveCargoEmailId =
    sessionMatch?.cargoEmailId || storedMatch.cargo_id || undefined;

  const panelProps = {
    matchDbId: storedMatch.id,
    score: storedMatch.score,
    status: storedMatch.status,
    loadPort: storedMatch.load_port,
    dischargePort: storedMatch.discharge_port,
    cargoType: storedMatch.cargo_type,
    vesselDwt: storedMatch.vessel_dwt,
    laycanDisplay,
    cargoEmailId: effectiveCargoEmailId,
    hasSessionMatch: !!sessionMatch,
  };

  return (
    <main className="min-h-screen bg-ds-bg">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'match' }} />

      {/* ===== HERO ROW ===== */}
      <div className="bg-ds-accent" data-testid="match-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-6">
          {/* Breadcrumb */}
          <Link
            href="/matches"
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-ds-accent-fg mb-4 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Matches
          </Link>

          <div className="flex items-center gap-4 sm:gap-6">
            {/* Amber score pill */}
            <div
              className="flex-shrink-0 flex flex-col items-center justify-center rounded-full bg-ds-accent-soft text-ds-accent-soft-fg w-20 h-20 sm:w-24 sm:h-24"
              data-testid="score-pill"
              aria-label={`Match score: ${storedMatch.score}`}
            >
              <span className="font-mono text-3xl sm:text-4xl font-semibold leading-none">
                {storedMatch.score}
              </span>
              <span className="text-xs font-medium opacity-60 mt-0.5">score</span>
            </div>

            {/* Headline + meta */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-lg sm:text-2xl font-semibold text-white truncate">
                  {storedMatch.vessel_name ?? storedMatch.vessel_id}
                </h1>
                {badgeCfg && (
                  <Badge className="bg-ds-accent-soft text-ds-accent-soft-fg border-0 text-xs">
                    {badgeCfg.label}
                  </Badge>
                )}
              </div>
              {routeMeta && (
                <p className="text-sm text-slate-300 truncate">{routeMeta}</p>
              )}
              {subMeta && (
                <p className="text-xs text-slate-400 mt-0.5 truncate">{subMeta}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== SPLIT BODY ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex gap-6 items-start">

          {/* Left 75% — main content */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Match overview cards — Vessel + Cargo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Vessel card */}
              <div className="bg-ds-surface rounded-xl ring-1 ring-ds-border p-4 space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
                  Vessel
                </h2>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ds-text-muted">Name</dt>
                    <dd className="font-medium text-ds-text truncate">{storedMatch.vessel_name ?? storedMatch.vessel_id}</dd>
                  </div>
                  {storedMatch.vessel_dwt && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ds-text-muted">DWT</dt>
                      <dd className="font-medium text-ds-text">
                        {storedMatch.vessel_dwt.toLocaleString()} MT
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt className="text-ds-text-muted">Status</dt>
                    <dd className="font-medium text-ds-text capitalize">{storedMatch.status}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ds-text-muted">Score</dt>
                    <dd className="font-mono font-semibold text-ds-accent-soft-fg">
                      {storedMatch.score}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Cargo card */}
              <div className="bg-ds-surface rounded-xl ring-1 ring-ds-border p-4 space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
                  Cargo
                </h2>
                <dl className="space-y-1 text-sm">
                  {storedMatch.cargo_type && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ds-text-muted">Type</dt>
                      <dd className="font-medium text-ds-text capitalize">{storedMatch.cargo_type}</dd>
                    </div>
                  )}
                  {storedMatch.load_port && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ds-text-muted">Load Port</dt>
                      <dd className="font-medium text-ds-text truncate">{storedMatch.load_port}</dd>
                    </div>
                  )}
                  {storedMatch.discharge_port && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ds-text-muted">Discharge</dt>
                      <dd className="font-medium text-ds-text truncate">{storedMatch.discharge_port}</dd>
                    </div>
                  )}
                  {laycanDisplay && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ds-text-muted">Laycan</dt>
                      <dd className="font-medium text-ds-text">{laycanDisplay}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {/* Rich tabs — only when session match is still available */}
            {sessionMatch && (
              <>
                {process.env.EXPLAIN_DEAL_ENABLED === 'true' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <ExplainDealModal
                      matchIndex={session.matches.indexOf(sessionMatch)}
                      language="en"
                    />
                  </div>
                )}

                <MatchTabs
                  match={sessionMatch}
                  vessel={vessel}
                  cargo={cargo}
                  cargoEmailId={effectiveCargoEmailId}
                  matchDbId={storedMatch.id}
                  storedFreightRate={storedMatch.freight_rate_usd_per_mt}
                  freightRateSource={storedMatch.freight_rate_source}
                />

                {cargo && cargoEmail && (
                  <SourceAttributionSection
                    fields={[
                      ...(cargo.cargoDescription ? [{ label: 'Cargo', value: cargo.cargoDescription }] : []),
                      ...(cargo.weightMt ? [{ label: 'Weight', value: cargo.weightMt }] : []),
                      ...(cargo.originPort ? [{ label: 'Load Port', value: cargo.originPort }] : []),
                      ...(cargo.destinationPort ? [{ label: 'Discharge Port', value: cargo.destinationPort }] : []),
                      ...(cargo.preferredDates ? [{ label: 'Laycan', value: cargo.preferredDates }] : []),
                    ]}
                    originalEmail={cargoEmail.body}
                  />
                )}
              </>
            )}

            {!sessionMatch && (
              <div className="bg-ds-surface rounded-xl ring-1 ring-ds-border p-4">
                <p className="text-sm text-ds-text-muted">
                  Session data is no longer available. Basic match details are shown above.
                </p>
              </div>
            )}
          </div>

          {/* Right ~25% — sticky AI side panel (desktop only) */}
          <aside
            className="hidden lg:block w-72 xl:w-80 shrink-0"
            aria-label="Match panel"
            data-testid="match-side-panel"
          >
            <div className="sticky top-4">
              <MatchDetailPanel {...panelProps} />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile: bottom-sheet FAB + sheet (outside flex layout so fixed positioning works) */}
      <MatchDetailMobileSheet {...panelProps} />
    </main>
  );
}
