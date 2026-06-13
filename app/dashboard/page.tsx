import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { isDemoMode } from '@/lib/demo-mode';
import { getStore } from '@/lib/session-store';
import { filterByCategory } from '@/lib/dashboard-queries';
import { countAwaitingApproval } from '@/lib/auto-prequote/queue';
import { classifyPriority } from '@/lib/sailing/priority-classifier';
import type { PriorityLevel } from '@/lib/sailing/priority-classifier';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { DashboardKpiStrip } from '@/components/dashboard/DashboardKpiStrip';
import { DashboardTodoSection } from '@/components/dashboard/DashboardTodoSection';
import { DashboardFreshMatches } from '@/components/dashboard/DashboardFreshMatches';
import { MorningHeader } from '@/components/dashboard/MorningHeader';
import { Badge } from '@/design-system/primitives';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { listMatches } from '@/lib/matching/matches-repository';
import { countQualifyingMatches } from '@/lib/matching/count-qualifying';
const PRIORITY_ORDER: Record<PriorityLevel, number> = { urgent: 0, attention: 1, ok: 2 };

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  const session = sessionId ? getSession(sessionId) : null;

  if (!session) {
    if (isDemoMode()) {
      redirect('/api/demo/rehydrate?next=/dashboard');
    }
    return (
      <div className="min-h-screen bg-ds-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold text-ds-text">No emails yet</h1>
          <p className="text-sm text-ds-text-muted">
            Upload emails to start analysing freight inquiries, vessel positions, and negotiations.
          </p>
          <Link
            href="/processing"
            className="inline-block px-6 py-3 bg-ds-accent text-ds-accent-fg text-sm font-medium rounded-ds-md hover:bg-ds-accent/90 transition-colors"
          >
            Upload emails
          </Link>
        </div>
      </div>
    );
  }

  const { emails, processedEmails, matches } = session;

  if (emails.length === 0) {
    return (
      <div className="bg-ds-bg min-h-screen">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
          <DashboardKpiStrip openMatches={0} activeCargoes={0} />
          <div className="flex items-center justify-center py-12">
            <div className="max-w-md w-full text-center space-y-4">
              <div className="text-4xl">📭</div>
              <h1 className="text-xl font-bold text-ds-text">No emails yet</h1>
              <p className="text-sm text-ds-text-muted">
                Upload emails to start analysing freight inquiries, vessel positions, and negotiations.
              </p>
              <Link
                href="/processing"
                className="inline-block px-6 py-3 bg-ds-accent text-ds-accent-fg text-sm font-medium rounded-ds-md hover:bg-ds-accent/90 transition-colors"
              >
                Upload emails
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cargoRows = filterByCategory(emails, processedEmails, 'CARGO_INQUIRY');

  const goodMatches = matches.filter(
    (m) => m.matchLevel === 'good' || m.matchLevel === 'possible',
  );

  const db = getStore().getDatabase();
  if (matches.length > 0) {
    persistSessionMatches(db, sessionId!, matches, session.parsedCargos, session.parsedVessels);
  }
  const storedMatches = listMatches(db, { user_id: sessionId!, sortBy: 'score', sortDir: 'desc' });
  // Item-aware key (audit C.5, migration 051): two items of the same email pair
  // are distinct rows — a 2-part (cargo_id, vessel_id) key would collapse them.
  // ?? 0 covers StoredMatch's optional item columns (pre-044 rows).
  const storedKey = (cargoId: string, cargoIdx: number | null | undefined, vesselId: string, vesselIdx: number | null | undefined) =>
    `${cargoId}|${cargoIdx ?? 0}|${vesselId}|${vesselIdx ?? 0}`;
  const matchIdMap = new Map(storedMatches.map((sm) => [storedKey(sm.cargo_id, sm.cargo_item_index, sm.vessel_id, sm.vessel_item_index), sm.id]));
  const storedByKey = new Map(storedMatches.map((sm) => [storedKey(sm.cargo_id, sm.cargo_item_index, sm.vessel_id, sm.vessel_item_index), sm]));
  const openMatchCount = countQualifyingMatches(db, { user_id: sessionId! });

  const priorityCards = goodMatches
    .map((match, i) => {
      const readinessGap =
        match.readiness?.gapDays !== null && match.readiness?.gapDays !== undefined
          ? match.readiness.gapDays * 24
          : undefined;
      const priority = classifyPriority({ confidence: match.confidence, readinessGap });
      const matchSummary = match.matchReasons[0] || `Match #${i + 1}`;
      const keyInsight = match.readiness?.explanation || `Level: ${match.matchLevel}`;
      const dbId = matchIdMap.get(storedKey(match.cargoEmailId, match.cargoItemIndex, match.vesselEmailId, match.vesselItemIndex));
      const href = dbId != null ? `/match/${dbId}` : '/matches';
      return { priority, matchSummary, keyInsight, href };
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const freshMatchesData = goodMatches
    .filter((m) => matchIdMap.get(storedKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex)) != null)
    .map((m) => ({
      id: matchIdMap.get(storedKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex))!,
      score: m.score,
      fit_percent: storedByKey.get(storedKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex))?.fit_percent ?? null,
      matchLevel: m.matchLevel,
      matchReasons: m.matchReasons,
    }));

  const rawName = session.accountId?.split('@')[0] ?? '';
  const userName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : '';

  return (
    <div className="bg-ds-bg min-h-screen">
      <AnalyticsTracker event="dashboard_viewed" />
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <MorningHeader userName={userName} alertCount={countAwaitingApproval()} />
          <div className="flex flex-col items-end gap-1">
            {session.isSampleData && (
              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-ds-warn-soft text-ds-warn">
                Sample data
              </span>
            )}
            {countAwaitingApproval() > 0 && (
              <Badge variant="warn" data-testid="pending-drafts-badge">
                {countAwaitingApproval()} drafts pending
              </Badge>
            )}
          </div>
        </div>

        {/* ── 4 KPI tiles ────────────────────────────────────────── */}
        <DashboardKpiStrip
          openMatches={openMatchCount}
          activeCargoes={cargoRows.length}
        />

        {/* ── 🎯 To do today ─────────────────────────────────────── */}
        <DashboardTodoSection cards={priorityCards} />

        {/* ── ✨ Fresh matches ────────────────────────────────────── */}
        <DashboardFreshMatches matches={freshMatchesData} />

        {/* ── 📊 Market Intelligence ─────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-ds-text-muted uppercase tracking-wide mb-3">
            Market Intelligence
          </h2>
          <Link
            href="/market"
            className="flex items-center justify-between p-4 bg-ds-surface border border-ds-border rounded-ds-lg hover:bg-ds-surface-muted transition-colors"
          >
            <div>
              <p className="text-sm font-semibold text-ds-text">Market Indices</p>
              <p className="text-xs text-ds-text-muted">BDI, bunker prices, freight benchmarks</p>
            </div>
            <span className="text-ds-text-subtle text-sm">→</span>
          </Link>
        </section>

        {/* ── Charterer Credit (feature flag) ────────────────────── */}
        {process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED === 'true' && (
          <Link
            href="/charterers"
            className="flex items-center justify-between p-4 bg-ds-surface border border-ds-border rounded-ds-lg hover:bg-ds-surface-muted transition-colors"
          >
            <div>
              <p className="text-sm font-semibold text-ds-text">Charterer Credit</p>
              <p className="text-xs text-ds-text-muted">Credit profiles for blue-chip charterers</p>
            </div>
            <span className="text-ds-text-subtle text-sm">→</span>
          </Link>
        )}

        {/* audit D revive: ROI report surface */}
        <Link
          href="/reports/roi"
          className="flex items-center justify-between p-4 bg-ds-surface border border-ds-border rounded-ds-lg hover:bg-ds-surface-muted transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-ds-text">ROI report</p>
            <p className="text-xs text-ds-text-muted">90-day savings summary preview</p>
          </div>
          <span className="text-ds-text-subtle text-sm">→</span>
        </Link>

      </div>
    </div>
  );
}
