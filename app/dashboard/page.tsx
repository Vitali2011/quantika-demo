import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { isDemoMode } from '@/lib/demo-mode';
import { getStore } from '@/lib/session-store';
import { filterByCategory } from '@/lib/dashboard-queries';
import { countAwaitingApproval } from '@/lib/auto-prequote/queue';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { DashboardKpiStrip } from '@/components/dashboard/DashboardKpiStrip';
import { DashboardTodoSection } from '@/components/dashboard/DashboardTodoSection';
import { DashboardFreshMatches } from '@/components/dashboard/DashboardFreshMatches';
import { MorningHeader } from '@/components/dashboard/MorningHeader';
import { Badge } from '@/design-system/primitives';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { deriveDashboardSurfaces } from '@/lib/matching/dashboard-surfaces';

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

  const db = getStore().getDatabase();
  if (matches.length > 0) {
    persistSessionMatches(db, sessionId!, matches, session.parsedCargos, session.parsedVessels);
  }
  // Single source of truth: KPI count AND both lists derive from the same deduped,
  // fit>=60 DB rows. Guarantees the headline count === rendered list length even
  // when a session "possible" match re-patches below 60 or a duplicate row exists
  // (see dashboard-surfaces.ts). Session matches only enrich rows (confidence).
  const { openMatchCount, priorityCards, freshMatchesData } = deriveDashboardSurfaces(
    db,
    matches,
    sessionId!,
  );

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

      </div>
    </div>
  );
}
