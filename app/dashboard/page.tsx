import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
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

const PRIORITY_ORDER: Record<PriorityLevel, number> = { urgent: 0, attention: 1, ok: 2 };

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  const {
    emails,
    processedEmails,
    matches,
    blockedMatches: rawBlockedMatches,
  } = session;

  const blockedMatches = rawBlockedMatches || [];
  const sanctionsBlocked = blockedMatches.filter((b) => b.sanctions?.blocking);
  const filterBlocked = blockedMatches.filter((b) => !b.sanctions?.blocking);

  if (emails.length === 0) {
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

  const cargoRows = filterByCategory(emails, processedEmails, 'CARGO_INQUIRY');

  const goodMatches = matches.filter(
    (m) => m.matchLevel === 'good' || m.matchLevel === 'possible',
  );

  const priorityCards = goodMatches
    .map((match, i) => {
      const readinessGap =
        match.readiness?.gapDays !== null && match.readiness?.gapDays !== undefined
          ? match.readiness.gapDays * 24
          : undefined;
      const priority = classifyPriority({ confidence: match.confidence, readinessGap });
      const matchSummary = match.matchReasons[0] || `Match #${i + 1}`;
      const keyInsight = match.readiness?.explanation || `Level: ${match.matchLevel}`;
      return { priority, matchSummary, keyInsight, href: `/match/${i}` };
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const freshMatchesData = goodMatches.map((m, i) => ({
    score: m.score,
    matchLevel: m.matchLevel,
    matchReasons: m.matchReasons,
    index: i,
  }));

  const rawName = session.accountId?.split('@')[0] ?? 'there';
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

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
          openMatches={goodMatches.length}
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

        {/* ── Blocked Matches ────────────────────────────────────── */}
        {blockedMatches.length > 0 && (
          <section className="mt-2">
            <h2 className="text-sm font-semibold text-ds-danger uppercase tracking-wide mb-3">
              🚫 Blocked Pairs ({blockedMatches.length})
            </h2>
            {sanctionsBlocked.length > 0 && (
              <div className="mb-4 space-y-2">
                {sanctionsBlocked.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 bg-ds-danger-soft border border-ds-danger/20 rounded-ds-md text-sm overflow-hidden"
                  >
                    <span className="font-medium text-ds-danger shrink-0">⛔</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-ds-text">{b.cargoEmailId}</span>
                      <span className="text-ds-text-muted mx-1">×</span>
                      <span className="font-medium text-ds-text">{b.vesselEmailId}</span>
                    </div>
                    <span className="text-ds-danger text-xs min-w-0 truncate">{b.filterReason}</span>
                    <span className="px-2 py-0.5 bg-ds-danger text-white text-xs rounded-ds-full shrink-0">
                      SANCTIONS
                    </span>
                  </div>
                ))}
              </div>
            )}
            {filterBlocked.length > 0 && (
              <details className="border border-ds-warn/30 rounded-ds-lg overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 bg-ds-warn-soft cursor-pointer hover:opacity-90 list-none">
                  <span className="text-sm font-semibold text-ds-warn">
                    🚫 Hard Filter Fails ({filterBlocked.length})
                  </span>
                  <span className="text-ds-warn text-xs select-none">▼</span>
                </summary>
                <div className="bg-ds-surface px-4 pb-4 pt-2 space-y-2">
                  {filterBlocked.map((b, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 bg-ds-warn-soft border border-ds-warn/20 rounded-ds-md text-sm overflow-hidden"
                    >
                      <span className="font-medium text-ds-warn shrink-0">🚫</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-ds-text">{b.cargoEmailId}</span>
                        <span className="text-ds-text-muted mx-1">×</span>
                        <span className="font-medium text-ds-text">{b.vesselEmailId}</span>
                      </div>
                      <span className="text-ds-warn text-xs min-w-0 truncate">{b.filterReason}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

      </div>
    </div>
  );
}
