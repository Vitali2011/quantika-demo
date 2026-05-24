import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { filterByCategory, getEmailCounts, groupByContact } from '@/lib/dashboard-queries';
import { EmailCard, EmailSection, ActionPanel } from '@/components/dashboard';
import { countAwaitingApproval } from '@/lib/auto-prequote/queue';
import { InboxBreakdown } from '@/components/dashboard/InboxBreakdown';
import { RoiSummaryTile } from '@/components/dashboard/RoiSummaryTile';
import SubsCountdownWidget from '@/components/deals/SubsCountdownWidget';
import { classifyPriority } from '@/lib/sailing/priority-classifier';
import type { PriorityLevel } from '@/lib/sailing/priority-classifier';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { formatNumber } from '@/lib/utils';
import { DashboardKpiStrip } from '@/components/dashboard/DashboardKpiStrip';
import { DashboardTodoSection } from '@/components/dashboard/DashboardTodoSection';
import { DashboardFreshMatches } from '@/components/dashboard/DashboardFreshMatches';
import { DashboardInboxSection } from '@/components/dashboard/DashboardInboxSection';
import type { InboxCounts } from '@/components/dashboard/DashboardInboxSection';
import { Badge } from '@/design-system/primitives';

const PRIORITY_ORDER: Record<PriorityLevel, number> = { urgent: 0, attention: 1, ok: 2 };

const DEMO_DEAL_ID = 'demo-deal-001';
const DEMO_SUBS_DEADLINE = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

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
    recaps,
    commissionSummary,
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
  const vesselRows = filterByCategory(emails, processedEmails, 'VESSEL_POSITION');
  const fixtureRows = filterByCategory(emails, processedEmails, 'FIXTURE_RECAP');
  const clientReplyRows = filterByCategory(emails, processedEmails, 'CLIENT_REPLY');
  const documentRows = filterByCategory(emails, processedEmails, 'DOCUMENT');
  const vesselCertRows = filterByCategory(emails, processedEmails, 'VESSEL_CERTIFICATE');
  const tctRequestRows = filterByCategory(emails, processedEmails, 'TCT_REQUEST');
  const otherOnlyRows = filterByCategory(emails, processedEmails, 'OTHER');
  const otherRows = [...clientReplyRows, ...documentRows, ...otherOnlyRows];

  const needsActionCargo = cargoRows.filter((r) => r.statusGroup === 'NEEDS_ACTION');

  const commissionLines =
    commissionSummary?.totalByCurrency
      .map(
        (t) =>
          `~${t.currency} ${formatNumber(t.amount, { maximumFractionDigits: 0 })}`,
      )
      .join(' + ') || null;

  const categoryCounts = getEmailCounts({
    CARGO_INQUIRY: cargoRows,
    VESSEL_POSITION: vesselRows,
    FIXTURE_RECAP: fixtureRows,
    CLIENT_REPLY: clientReplyRows,
    DOCUMENT: documentRows,
    VESSEL_CERTIFICATE: vesselCertRows,
    TCT_REQUEST: tctRequestRows,
    OTHER: otherOnlyRows,
  });

  const isSample = session.isSampleData === true;
  const allContacts = groupByContact(emails);
  const topContacts = allContacts.slice(0, 10);
  const maxContactEmails = topContacts.length > 0 ? topContacts[0].count : 1;

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

  const noActiveDeals = goodMatches.length === 0;

  return (
    <div className="bg-ds-bg min-h-screen">
      <AnalyticsTracker event="dashboard_viewed" />
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">

        {/* ── ROI Summary (feature flag) ──────────────────────────── */}
        {process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED === 'true' && <RoiSummaryTile />}

        {/* ── Subs Countdown (feature flag) ──────────────────────── */}
        {process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED === 'true' && (
          <SubsCountdownWidget
            dealId={DEMO_DEAL_ID}
            subsDeadline={DEMO_SUBS_DEADLINE}
            chartererTier="blue-chip"
          />
        )}

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-ds-text">Dashboard</h1>
            {isSample && (
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-medium bg-ds-warn-soft text-ds-warn">
                Sample data
              </span>
            )}
          </div>
          {countAwaitingApproval() > 0 && (
            <Badge variant="warn" data-testid="pending-drafts-badge">
              {countAwaitingApproval()} drafts pending
            </Badge>
          )}
        </div>

        {/* ── 4 KPI tiles ────────────────────────────────────────── */}
        <DashboardKpiStrip
          openMatches={goodMatches.length}
          activeCargoes={cargoRows.length}
          activeVessels={vesselRows.length}
        />

        {/* ── 🎯 To do today ─────────────────────────────────────── */}
        <DashboardTodoSection cards={priorityCards} />

        {/* ── ✨ Fresh matches ────────────────────────────────────── */}
        <DashboardFreshMatches matches={freshMatchesData} />

        {/* ── 📥 Inbox ───────────────────────────────────────────── */}
        <DashboardInboxSection
          counts={categoryCounts as InboxCounts}
          totalEmails={emails.length}
          needsAction={needsActionCargo.length}
        />

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

        {/* ── Action Panel ───────────────────────────────────────── */}
        <ActionPanel
          needsActionCargo={needsActionCargo}
          goodMatches={goodMatches}
          fixtureRows={fixtureRows}
          commissionSummary={commissionSummary}
          commissionLines={commissionLines}
          oldestDays={
            needsActionCargo.length > 0
              ? Math.max(...needsActionCargo.map((r) => r.processed.daysWithoutReply || 0))
              : 0
          }
        />

        {/* ── Active Negotiations ─────────────────────────────────── */}
        {recaps.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-ds-text-muted uppercase tracking-wide mb-3">
              Active Negotiations
            </h2>
            <div className="space-y-2">
              {recaps.map((recap) => (
                <Link
                  key={recap.threadId}
                  href={`/recap/${recap.threadId}`}
                  className="block focus-visible:ring-2 focus-visible:ring-ds-accent/40 rounded-ds-md outline-none"
                >
                  <div className="flex items-center justify-between p-3 rounded-ds-md hover:bg-ds-surface-muted transition-colors border border-ds-border bg-ds-surface">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ds-text truncate">{recap.subject}</p>
                      <p className="text-xs text-ds-text-muted">
                        {recap.emailCount} emails · {recap.dateRange} ·{' '}
                        {recap.points.filter((p) => p.status === 'AGREED').length}/{recap.points.length}{' '}
                        terms agreed
                      </p>
                    </div>
                    <span className="shrink-0 ml-3 text-xs text-ds-text-subtle">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Full Inbox (collapsible) ───────────────────────────── */}
        <details className="border border-ds-border rounded-ds-lg overflow-hidden">
          <summary className="px-4 py-3 bg-ds-surface cursor-pointer hover:bg-ds-surface-muted list-none">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-ds-text text-sm">Full Inbox</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-ds-text-muted">{emails.length} emails</span>
                <span className="text-ds-text-subtle text-xs select-none">▼</span>
              </div>
            </div>
            <div className="space-y-1">
              {(
                [
                  { key: 'CARGO_INQUIRY', label: 'Cargo Inquiries', count: categoryCounts.CARGO_INQUIRY },
                  { key: 'VESSEL_POSITION', label: 'Vessel Positions', count: categoryCounts.VESSEL_POSITION },
                  { key: 'FIXTURE_RECAP', label: 'Fixture Recaps', count: categoryCounts.FIXTURE_RECAP },
                  { key: 'VESSEL_CERTIFICATE', label: 'Vessel Certificates', count: categoryCounts.VESSEL_CERTIFICATE },
                  { key: 'TCT_REQUEST', label: 'TCT Requests', count: categoryCounts.TCT_REQUEST },
                  { key: 'DOCUMENT', label: 'Documents', count: categoryCounts.DOCUMENT },
                  { key: 'CLIENT_REPLY', label: 'Client Replies', count: categoryCounts.CLIENT_REPLY },
                  { key: 'OTHER', label: 'Other', count: categoryCounts.OTHER },
                ] as { key: string; label: string; count: number }[]
              )
                .filter((item) => item.count > 0)
                .map(({ key, label, count }) => (
                  <div key={key} className="flex items-center justify-between py-0.5 px-1">
                    <span className="text-xs text-ds-text-muted">{label}</span>
                    <span className="text-xs font-semibold text-ds-text tabular-nums">{count}</span>
                  </div>
                ))}
            </div>
          </summary>
          <div className="bg-ds-bg px-4 py-4 space-y-3" id="inbox">
            <div id="cargo">
              <EmailSection category="CARGO_INQUIRY" rows={cargoRows} totalCount={categoryCounts.CARGO_INQUIRY} />
            </div>
            <div>
              <EmailSection category="VESSEL_POSITION" rows={vesselRows} totalCount={categoryCounts.VESSEL_POSITION} />
            </div>
            <div id="fixture">
              <EmailSection category="FIXTURE_RECAP" rows={fixtureRows} totalCount={categoryCounts.FIXTURE_RECAP} />
            </div>
            {categoryCounts.VESSEL_CERTIFICATE > 0 && (
              <div id="vessel-certificates">
                <EmailSection category="VESSEL_CERTIFICATE" rows={vesselCertRows} totalCount={categoryCounts.VESSEL_CERTIFICATE} />
              </div>
            )}
            {categoryCounts.TCT_REQUEST > 0 && (
              <div id="tct-requests">
                <EmailSection category="TCT_REQUEST" rows={tctRequestRows} totalCount={categoryCounts.TCT_REQUEST} />
              </div>
            )}
            {categoryCounts.DOCUMENT + categoryCounts.CLIENT_REPLY + categoryCounts.OTHER > 0 && (
              <details className="border border-ds-border rounded-ds-md overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 bg-ds-surface cursor-pointer hover:bg-ds-surface-muted list-none">
                  <span className="font-medium text-ds-text text-sm">Other</span>
                  <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-ds-surface-muted text-ds-text-muted">
                    {categoryCounts.DOCUMENT + categoryCounts.CLIENT_REPLY + categoryCounts.OTHER}
                  </span>
                </summary>
                <div className="bg-ds-surface px-4 pb-4 pt-2 space-y-1">
                  {otherRows.map((row) => (
                    <EmailCard key={row.email.id} row={row} href={`/cargo/${row.email.id}`} />
                  ))}
                </div>
              </details>
            )}
          </div>
        </details>

        {/* ── Inbox Breakdown (summary) ───────────────────────────── */}
        {!noActiveDeals && (
          <section>
            <h2 className="text-sm font-semibold text-ds-text-muted uppercase tracking-wide mb-3">
              Inbox Breakdown
            </h2>
            <InboxBreakdown
              cargoInquiries={categoryCounts.CARGO_INQUIRY}
              vesselPositions={categoryCounts.VESSEL_POSITION}
              fixtureRecaps={categoryCounts.FIXTURE_RECAP}
              clientReplies={categoryCounts.CLIENT_REPLY}
              noise={categoryCounts.OTHER + categoryCounts.DOCUMENT}
            />
          </section>
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

        {/* ── Network ────────────────────────────────────────────── */}
        {topContacts.length > 0 && (
          <details className="border border-ds-border rounded-ds-lg overflow-hidden">
            <summary className="flex items-center justify-between px-5 py-4 bg-ds-surface cursor-pointer hover:bg-ds-surface-muted list-none">
              <span className="font-semibold text-ds-text text-sm">Your Network</span>
              <span className="text-sm text-ds-text-muted">from {emails.length} emails</span>
            </summary>
            <div className="bg-ds-surface px-4 pb-4 pt-2">
              {topContacts.map((contact, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-2 border-b border-ds-border last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-ds-text truncate">{contact.name}</p>
                      <span className="shrink-0 ml-3 text-xs font-semibold text-ds-text-muted">
                        {contact.count} {contact.count === 1 ? 'email' : 'emails'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-ds-surface-muted rounded-ds-full overflow-hidden">
                      <div
                        className="h-full bg-ds-accent rounded-ds-full"
                        style={{ width: `${Math.round((contact.count / maxContactEmails) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* ── Disclaimer ─────────────────────────────────────────── */}
        <div className="rounded-ds-md border border-ds-warn/30 bg-ds-warn-soft px-4 py-3">
          <p className="text-xs text-ds-warn">
            <strong>⚠️ Disclaimer:</strong> This analysis is AI-generated and may contain errors.
            All information should be independently verified before making business decisions.
            Commission estimates are based on extracted recap data and may not reflect final agreed amounts.
          </p>
        </div>

        <div className="flex justify-end">
          <Link
            href="/summary"
            className="px-4 py-2 bg-ds-accent text-ds-accent-fg text-sm font-medium rounded-ds-md hover:bg-ds-accent/90 transition-colors"
          >
            View Summary &amp; Impact →
          </Link>
        </div>
      </div>
    </div>
  );
}
