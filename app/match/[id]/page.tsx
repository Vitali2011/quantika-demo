import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { getMatch, getMatchBySlug } from '@/lib/matching/matches-repository';
import { fromMatchSlug } from '@/lib/matching/match-slug';
import { isDemoMode } from '@/lib/demo-mode';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { resolveLaycanDisplay } from '@/lib/utils/laycan-display';
import { Badge } from '@/components/ui/badge';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { MatchTabs } from '@/components/match/MatchTabs';
import { SourceAttributionSection } from '@/components/match/SourceAttributionSection';
import { ExplainDealModal } from '@/components/match/ExplainDealModal';
import { MatchDetailPanel, MatchDetailMobileSheet } from '@/components/match/MatchDetailPanel';
import { MatchWorksheet } from '@/components/match/MatchWorksheet';
import type { MatchWorksheet as MatchWorksheetType } from '@/lib/types';
import { cfValue } from '@/lib/types';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { demotionReason } from '@/lib/sailing/match-scoring';
import { getBalticDayRate } from '@/lib/market/baltic-freight';
import { lookupCii } from '@/lib/imo/cii-lookup';

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
  if (!session) {
    if (isDemoMode()) redirect(`/api/demo/rehydrate?next=/match/${id}`);
    redirect('/dashboard');
  }

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

  // Session isolation: 404 if match not found or belongs to another session.
  // Demo mode: stale numeric ID (owned by evicted session) — re-persist under new session
  // then resolve via stable cargo_id/vessel_id slug.
  if (!storedMatch || storedMatch.user_id !== sessionId) {
    if (isDemoMode() && storedMatch && storedMatch.user_id !== sessionId && session) {
      persistSessionMatches(db, sessionId!, session.matches, session.parsedCargos, session.parsedVessels);
      storedMatch = getMatchBySlug(db, storedMatch.cargo_id, storedMatch.vessel_id, sessionId!) ?? null;
    }
    if (!storedMatch || storedMatch.user_id !== sessionId) notFound();
  }

  // Enrich with in-session data if still available (session may have expired/reloaded).
  // Item-aware (migration 051): a single (cargo_id, vessel_id) pair can yield multiple
  // matches distinguished by item index, so the 2-part key alone returns the FIRST item
  // and desyncs tabs/worksheet/economics from the hero. Match the full 4-part key —
  // mirroring dashboard/page.tsx and persist-session-matches.ts. Legacy rows have null
  // index columns → coalesce to 0 (the default written for item-0 matches).
  const sessionMatch = session.matches.find(
    (m) =>
      m.cargoEmailId === storedMatch.cargo_id &&
      m.vesselEmailId === storedMatch.vessel_id &&
      m.cargoItemIndex === (storedMatch.cargo_item_index ?? 0) &&
      m.vesselItemIndex === (storedMatch.vessel_item_index ?? 0),
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
  const vesselEmail = sessionMatch
    ? session.emails.find((e) => e.id === sessionMatch.vesselEmailId)
    : undefined;

  const badgeCfg = sessionMatch
    ? (MATCH_LEVEL_BADGE[sessionMatch.matchLevel] ?? MATCH_LEVEL_BADGE.possible)
    : null;

  // Why does an 87%-fit match read as "Possible"? The ballast/size cap can demote a
  // high-fit match below its fit-implied tier (#1003). Surface that reason so the
  // pill, the fit-%, and the bucket label stop reading as a contradiction.
  const demotionNote = sessionMatch
    ? demotionReason(
        sessionMatch.fitPercent ?? storedMatch.fit_percent ?? null,
        sessionMatch.matchLevel,
        sessionMatch.issues ?? [],
      )
    : null;

  let worksheet: MatchWorksheetType | null = null;
  if (storedMatch.worksheet_json) {
    try {
      worksheet = JSON.parse(storedMatch.worksheet_json) as MatchWorksheetType;
    } catch {
      // malformed JSON — degrade gracefully
    }
  }

  // Unified laycan: worksheet readiness window (rebased) → storedMatch timestamps → raw cargo string → null
  // Readiness wins so CARGO card aligns with the Time row in MatchWorksheet (both show rebased window).
  // Shared with /matches list and /cargo via resolveLaycanDisplay (#665).
  const laycanDisplay = resolveLaycanDisplay({
    worksheet,
    storedStart: storedMatch.laycan_start,
    storedEnd: storedMatch.laycan_end,
    cargoRaw: cargo?.preferredDates?.value ?? null,
    refYear: new Date().getUTCFullYear(),
  });

  const routeMeta = [storedMatch.load_port, storedMatch.discharge_port]
    .filter(Boolean)
    .join(' → ');
  const subMeta = [
    storedMatch.cargo_type,
    storedMatch.vessel_dwt ? `${storedMatch.vessel_dwt.toLocaleString('en-US')} DWT` : null,
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
    cargoEmailId: effectiveCargoEmailId,
    hasSessionMatch: !!sessionMatch,
    fitPercent: storedMatch.fit_percent ?? null,
    fitBreakdown: storedMatch.fit_breakdown ?? null,
    bucketReason: worksheet?.bucketReason,
  };

  // Ballast reposition distance: open position → load port (nm).
  // Stored-first: prefer the persisted value so detail TCE matches list TCE even
  // after session expiry (I5 fix). Falls back to session re-derivation for legacy
  // rows written before migration 047 that have null stored value.
  const ballastDistanceNm =
    storedMatch.ballast_distance_nm ??
    (vessel && cargo
      ? (getPortDistance(cfValue(vessel.openPosition) ?? '', cfValue(cargo.originPort) ?? '')?.nm ?? null)
      : null);

  // W6a: Baltic TC staleness badge. When the stored freight rate came from the Baltic
  // tier-2 waterfall, surface the rate's price_date so EconomicsTab can show a stale badge.
  const balticRateAsOf = storedMatch.freight_rate_source === 'baltic' && vessel
    ? (getBalticDayRate(db, cfValue(vessel.dwtSummer) ?? 0)?.date ?? null)
    : null;

  // CII provenance for the disclosure asterisk: the badge only renders for a D/E
  // restriction; 'estimated' (age/type rule) and 'llm-fallback' (AI) both disclose.
  // Resolve source WITHOUT a live LLM call (stub returns 'unknown' — we use only .source,
  // the badge rating comes from restrictions). Dataset hit → imo-public/estimated; miss → llm-fallback.
  const hasCiiDorE = !!vessel?.restrictions?.some((r) => typeof r === 'string' && /\bCII\s+rating\s+[DE]\b/i.test(r));
  let ciiSource: 'imo-public' | 'estimated' | 'llm-fallback' | undefined;
  if (vessel?.imo && hasCiiDorE) {
    ciiSource = (await lookupCii(vessel.imo, { callLlm: async () => 'unknown' })).source;
  }
  const vesselWithCii = vessel && ciiSource ? { ...vessel, ciiSource } : vessel;

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
            {/* Score / Fit pill */}
            {storedMatch.fit_percent != null && (() => {
              const fitPct = Math.round(storedMatch.fit_percent!);
              const fitColor = fitPct >= 85
                ? 'bg-emerald-100 text-emerald-800'
                : fitPct >= 60
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600';
              return (
                <div
                  className={`flex-shrink-0 flex flex-col items-center justify-center rounded-full w-20 h-20 sm:w-24 sm:h-24 ${fitColor}`}
                  data-testid="score-pill"
                  aria-label={`Fit score: ${fitPct}%`}
                >
                  <span className="font-mono text-3xl sm:text-4xl font-semibold leading-none">
                    {fitPct}%
                  </span>
                  <span className="text-xs font-medium opacity-60 mt-0.5">fit</span>
                </div>
              );
            })()}

            {/* Headline + meta */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-lg sm:text-2xl font-semibold text-white truncate">
                  {storedMatch.vessel_name ?? 'TBN'}
                </h1>
                {badgeCfg && (
                  <Badge
                    className="bg-ds-accent-soft text-ds-accent-soft-fg border-0 text-xs"
                    title={demotionNote ?? undefined}
                  >
                    {badgeCfg.label}
                  </Badge>
                )}
              </div>
              {demotionNote && (
                <p className="text-xs text-amber-300/90 mt-0.5 truncate" title={demotionNote}>
                  Capped: {demotionNote}
                </p>
              )}
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
              {/* Vessel card — Name + Fit% + Status only (DWT lives in Svodka) */}
              <div className="bg-ds-surface rounded-xl ring-1 ring-ds-border p-4 space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
                  Vessel
                </h2>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ds-text-muted">Name</dt>
                    <dd className="font-medium text-ds-text truncate">{storedMatch.vessel_name ?? 'TBN'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ds-text-muted">Status</dt>
                    <dd className="font-medium text-ds-text capitalize">{storedMatch.status}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ds-text-muted">{storedMatch.fit_percent != null ? 'Fit' : 'Score'}</dt>
                    <dd className="font-mono font-semibold text-ds-accent-soft-fg">
                      {storedMatch.fit_percent != null ? `${Math.round(storedMatch.fit_percent)}%` : storedMatch.score}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Cargo card — Route + Laycan only (details in Svodka) */}
              <div className="bg-ds-surface rounded-xl ring-1 ring-ds-border p-4 space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
                  Cargo
                </h2>
                <dl className="space-y-1 text-sm">
                  {routeMeta && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ds-text-muted">Route</dt>
                      <dd className="font-medium text-ds-text truncate">{routeMeta}</dd>
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

            {/* Match Worksheet — vessel×cargo summary (above tabs, null-safe) */}
            <MatchWorksheet worksheet={worksheet} />

            {/* Rich tabs — only when session match is still available */}
            {sessionMatch && (
              <>
                {process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED === 'true' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <ExplainDealModal
                      matchIndex={session.matches.indexOf(sessionMatch)}
                      language="en"
                    />
                  </div>
                )}

                <MatchTabs
                  match={sessionMatch}
                  vessel={vesselWithCii}
                  cargo={cargo}
                  cargoEmailId={effectiveCargoEmailId}
                  matchDbId={storedMatch.id}
                  storedFreightRate={storedMatch.freight_rate_usd_per_mt}
                  freightRateSource={storedMatch.freight_rate_source}
                  storedDistanceNm={storedMatch.distance_nm}
                  storedTceUsdPerDay={storedMatch.tce_usd_per_day}
                  ballastDistanceNm={ballastDistanceNm}
                  consumptionEstimated={storedMatch.consumption_estimated === 1}
                  balticRateAsOf={balticRateAsOf}
                  cargoEmailBody={cargoEmail?.body ?? null}
                  vesselEmailBody={vesselEmail?.body ?? null}
                  payoutCondition={cargo?.payoutCondition ?? null}
                  storedBreakevenTce={storedMatch.breakeven_tce_usd_per_day}
                  fitBreakdown={storedMatch.fit_breakdown ?? null}
                />

                {cargo && cargoEmail && (
                  <SourceAttributionSection
                    fields={[
                      ...(cargo.cargoDescription ? [{ label: 'Cargo', value: cargo.cargoDescription }] : []),
                      ...(cargo.weightMt != null ? [{ label: 'Weight', value: { ...cargo.weightMt, value: `${cargo.weightMt.value} mt` } }] : []),
                      ...(cargo.originPort ? [{ label: 'Load Port', value: cargo.originPort }] : []),
                      ...(cargo.destinationPort ? [{ label: 'Discharge Port', value: cargo.destinationPort }] : []),
                      ...(laycanDisplay
                    ? [{ label: 'Laycan', value: { value: laycanDisplay, confidence: 'confirmed' as const, sourceText: cargo.preferredDates?.sourceText } }]
                    : cargo.preferredDates
                      ? [{ label: 'Laycan', value: cargo.preferredDates }]
                      : []),
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
