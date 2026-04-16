/* eslint-disable @typescript-eslint/no-unused-vars */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { CATEGORY_LABELS, STATUS_CONFIG, CATEGORY_COLORS } from '@/lib/constants';
import type { EmailCategory, EmailStatus, ProcessedEmail, Email } from '@/lib/types';

// STATUS ordering for display
const STATUS_ORDER: EmailStatus[] = ['NEEDS_ACTION', 'PENDING', 'RESPONDED', 'INFO_ONLY'];

// Map STALE freshness to a display group
const STALE_LABEL = 'STALE';

type StatusGroup = EmailStatus | typeof STALE_LABEL;

interface EmailRow {
  email: Email;
  processed: ProcessedEmail;
  statusGroup: StatusGroup;
}

function groupByStatus(rows: EmailRow[]): Record<StatusGroup, EmailRow[]> {
  const groups: Record<string, EmailRow[]> = {};
  for (const row of rows) {
    const key = row.statusGroup;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return groups as Record<StatusGroup, EmailRow[]>;
}

const STATUS_GROUPS_ORDER: StatusGroup[] = ['NEEDS_ACTION', 'PENDING', 'RESPONDED', 'INFO_ONLY', STALE_LABEL];

function StatusBadge({ status }: { status: StatusGroup }) {
  if (status === STALE_LABEL) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
        🕳️ Stale
      </span>
    );
  }
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function EmailListItem({
  row,
  href,
}: {
  row: EmailRow;
  href: string;
}) {
  const isStale = row.statusGroup === STALE_LABEL;
  const days = row.processed.daysWithoutReply;
  return (
    <Link href={href}>
      <div
        className={`flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 ${isStale ? 'opacity-50' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate text-gray-900">
            {row.email.fromName || row.email.fromEmail || row.email.from}
          </p>
          <p className="text-xs text-gray-500 truncate">{row.email.subject}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <StatusBadge status={row.statusGroup} />
          {days !== null && days > 0 && !isStale && row.processed.status === 'NEEDS_ACTION' && (
            <span className="text-xs text-red-600 font-medium">{days}d</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CategorySection({
  category,
  rows,
  totalCount,
}: {
  category: EmailCategory;
  rows: EmailRow[];
  totalCount: number;
}) {
  const grouped = groupByStatus(rows);
  const colorClass = CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-800';

  return (
    <details className="border border-gray-200 rounded-lg overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-gray-50 list-none">
        <span className="font-medium text-gray-800">
          {CATEGORY_LABELS[category] || category}
        </span>
        <span className={`ml-2 px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}>
          {totalCount}
        </span>
      </summary>
      <div className="bg-white px-4 pb-4 space-y-4">
        {STATUS_GROUPS_ORDER.map((statusGroup) => {
          const groupRows = grouped[statusGroup];
          if (!groupRows || groupRows.length === 0) return null;
          const isStaleGroup = statusGroup === STALE_LABEL;
          const groupLabel =
            statusGroup === STALE_LABEL
              ? '🕳️ Stale'
              : `${STATUS_CONFIG[statusGroup]?.emoji || ''} ${STATUS_CONFIG[statusGroup]?.label || statusGroup}`;
          return (
            <div key={statusGroup}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 mt-3 ${isStaleGroup ? 'text-gray-400' : 'text-gray-600'}`}>
                {groupLabel} ({groupRows.length})
              </p>
              <div className="space-y-1">
                {groupRows.map((row) => {
                  let href = '#';
                  if (category === 'CARGO_INQUIRY') href = `/cargo/${row.email.id}`;
                  else if (category === 'VESSEL_POSITION') href = `/vessel/${row.email.id}`;
                  else if (category === 'FIXTURE_RECAP') href = `/fixture/${row.email.id}`;
                  else href = `/cargo/${row.email.id}`;
                  return <EmailListItem key={row.email.id} row={row} href={href} />;
                })}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="text-sm text-gray-400 pt-2">No emails in this category.</p>
        )}
      </div>
    </details>
  );
}

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
    counterparties,
    parsedFixtureRecaps,
  } = session;

  if (emails.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold text-gray-900">No emails yet</h1>
          <p className="text-sm text-gray-500">
            Load your emails to start analyzing cargo inquiries, vessel positions, and negotiations.
          </p>
          <Link
            href="/processing"
            className="inline-block px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            Загрузить письма
          </Link>
        </div>
      </main>
    );
  }

  // Build a map: emailId -> ProcessedEmail
  const processedMap = new Map<string, ProcessedEmail>();
  for (const pe of processedEmails) {
    processedMap.set(pe.emailId, pe);
  }

  // Build a map: emailId -> Email
  const emailMap = new Map<string, Email>();
  for (const e of emails) {
    emailMap.set(e.id, e);
  }

  // Build EmailRow list
  function buildRows(category: EmailCategory): EmailRow[] {
    const rows: EmailRow[] = [];
    for (const pe of processedEmails) {
      if (pe.type !== category) continue;
      const email = emailMap.get(pe.emailId);
      if (!email) continue;
      const isStale = pe.freshness === 'stale';
      const statusGroup: StatusGroup = isStale ? STALE_LABEL : pe.status;
      rows.push({ email, processed: pe, statusGroup });
    }
    // Sort: NEEDS_ACTION first, then PENDING, RESPONDED, INFO_ONLY, STALE
    rows.sort((a, b) => {
      const orderA = STATUS_GROUPS_ORDER.indexOf(a.statusGroup);
      const orderB = STATUS_GROUPS_ORDER.indexOf(b.statusGroup);
      if (orderA !== orderB) return orderA - orderB;
      // Within NEEDS_ACTION, sort by daysWithoutReply desc
      if (a.statusGroup === 'NEEDS_ACTION') {
        return (b.processed.daysWithoutReply || 0) - (a.processed.daysWithoutReply || 0);
      }
      return 0;
    });
    return rows;
  }

  const cargoRows = buildRows('CARGO_INQUIRY');
  const vesselRows = buildRows('VESSEL_POSITION');
  const fixtureRows = buildRows('FIXTURE_RECAP');
  const clientReplyRows = buildRows('CLIENT_REPLY');
  const documentRows = buildRows('DOCUMENT');
  const otherOnlyRows = buildRows('OTHER');
  const otherRows = [
    ...clientReplyRows,
    ...documentRows,
    ...otherOnlyRows,
  ];

  // Action block: unanswered inquiries
  const needsActionCargo = cargoRows.filter((r) => r.statusGroup === 'NEEDS_ACTION');
  const oldestDays =
    needsActionCargo.length > 0
      ? Math.max(...needsActionCargo.map((r) => r.processed.daysWithoutReply || 0))
      : 0;

  // Good/possible matches
  const goodMatches = matches.filter((m) => m.matchLevel === 'good' || m.matchLevel === 'possible');

  // Commission totals
  const commissionLines =
    commissionSummary?.totalByCurrency
      .map((t) => `~${t.currency} ${t.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
      .join(' + ') || null;

  // Active negotiations (recaps)
  const activeRecaps = recaps;

  // Category counts (all statuses including stale)
  const categoryCounts: Record<string, number> = {
    CARGO_INQUIRY: cargoRows.length,
    VESSEL_POSITION: vesselRows.length,
    FIXTURE_RECAP: fixtureRows.length,
    CLIENT_REPLY: clientReplyRows.length,
    DOCUMENT: documentRows.length,
    OTHER: otherOnlyRows.length,
  };

  const isSample = session.isSampleData === true;

  // Compute top contacts from emails (grouped by fromEmail)
  const senderMap = new Map<string, { name: string; count: number }>();
  for (const email of emails) {
    const key = (email.fromEmail || email.from || '').toLowerCase().trim();
    if (!key) continue;
    const existing = senderMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      senderMap.set(key, { name: email.fromName || email.fromEmail || email.from || key, count: 1 });
    }
  }
  const topContacts = Array.from(senderMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const maxContactEmails = topContacts.length > 0 ? topContacts[0].count : 1;

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            Good morning. Here&apos;s what needs your attention:
          </h1>
          <p className="text-sm text-gray-500 mt-1">{emails.length} emails processed</p>
          {isSample && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
              Sample data
            </span>
          )}
        </div>

        {/* ── ACTION BLOCKS ── */}
        <div className="space-y-3">
          {/* Unanswered inquiries */}
          {needsActionCargo.length > 0 ? (
            <details className="rounded-lg border bg-red-50 border-red-200 overflow-hidden">
              <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-red-100 list-none">
                <span className="text-2xl">🔴</span>
                <div className="flex-1">
                  <p className="font-semibold text-red-800">
                    {needsActionCargo.length} {needsActionCargo.length === 1 ? 'inquiry' : 'inquiries'} waiting for your reply
                  </p>
                  {oldestDays > 0 && (
                    <p className="text-sm text-red-600">Oldest: {oldestDays} days without reply · tap to expand</p>
                  )}
                </div>
                <span className="shrink-0 text-red-400 text-sm">▼</span>
              </summary>
              <div className="bg-white px-4 pb-4 pt-2 space-y-1">
                {needsActionCargo.map((row) => (
                  <EmailListItem key={row.email.id} row={row} href={`/cargo/${row.email.id}`} />
                ))}
              </div>
            </details>
          ) : (
            <div className="flex items-center p-4 rounded-lg border bg-white border-gray-200">
              <span className="text-2xl mr-3">🔴</span>
              <p className="font-medium text-gray-600">No unanswered inquiries — all clear</p>
            </div>
          )}

          {/* Matches */}
          {goodMatches.length > 0 ? (
            <details className="rounded-lg border bg-blue-50 border-blue-200 overflow-hidden">
              <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-blue-100 list-none">
                <span className="text-2xl">🔗</span>
                <div className="flex-1">
                  <p className="font-semibold text-blue-800">
                    {goodMatches.length} vessel-cargo {goodMatches.length === 1 ? 'match' : 'matches'} found
                  </p>
                  <p className="text-sm text-blue-600">tap to expand</p>
                </div>
                <span className="shrink-0 text-blue-400 text-sm">▼</span>
              </summary>
              <div className="bg-white px-4 pb-4 pt-2 space-y-1">
                {goodMatches.map((match, i) => (
                  <Link key={i} href={`/match/${i}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 bg-white">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {match.matchReasons[0] || `Match #${i + 1}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          Level: {match.matchLevel} · {match.matchReasons.length} reasons
                        </p>
                      </div>
                      <span className={`shrink-0 ml-3 px-2 py-0.5 rounded text-xs font-semibold ${match.matchLevel === 'good' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {match.matchLevel}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </details>
          ) : (
            <div className="flex items-center p-4 rounded-lg border bg-white border-gray-200">
              <span className="text-2xl mr-3">🔗</span>
              <p className="font-medium text-gray-500">No vessel-cargo matches found</p>
            </div>
          )}

          {/* Fixture recaps */}
          {fixtureRows.length > 0 ? (
            <details className="rounded-lg border bg-purple-50 border-purple-200 overflow-hidden">
              <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-purple-100 list-none">
                <span className="text-2xl">📋</span>
                <div className="flex-1">
                  <p className="font-semibold text-purple-800">
                    {fixtureRows.length} fixture {fixtureRows.length === 1 ? 'recap' : 'recaps'} extracted
                  </p>
                  <p className="text-sm text-purple-600">tap to expand</p>
                </div>
                <span className="shrink-0 text-purple-400 text-sm">▼</span>
              </summary>
              <div className="bg-white px-4 pb-4 pt-2 space-y-1">
                {fixtureRows.map((row) => (
                  <EmailListItem key={row.email.id} row={row} href={`/fixture/${row.email.id}`} />
                ))}
              </div>
            </details>
          ) : (
            <div className="flex items-center p-4 rounded-lg border bg-white border-gray-200">
              <span className="text-2xl mr-3">📋</span>
              <p className="font-medium text-gray-500">No fixture recaps found</p>
            </div>
          )}

          {/* Commission */}
          <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 rounded-lg border ${commissionSummary && commissionSummary.details.length > 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">💰</span>
              <div>
                {commissionSummary && commissionSummary.details.length > 0 ? (
                  <p className="font-semibold text-green-800">
                    Commission from recaps: {commissionLines}
                  </p>
                ) : (
                  <p className="font-medium text-gray-500">No commission data from recaps</p>
                )}
              </div>
            </div>
            {commissionSummary && commissionSummary.details.length > 0 && (
              <Link
                href="/commission"
                className="shrink-0 ml-4 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                See Breakdown
              </Link>
            )}
          </div>
        </div>

        {/* ── FULL INBOX BREAKDOWN (collapsed) ── */}
        <details className="border border-gray-300 rounded-xl overflow-hidden">
          <summary className="px-3 sm:px-5 py-3 sm:py-4 bg-white cursor-pointer hover:bg-gray-50 list-none">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-900">Full Inbox Breakdown</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{emails.length} emails total</span>
                <span className="text-gray-400 text-xs select-none">▼</span>
              </div>
            </div>
            <div className="space-y-1">
              {([
                { key: 'CARGO_INQUIRY', emoji: '📦', label: 'Cargo Inquiries', count: categoryCounts.CARGO_INQUIRY },
                { key: 'VESSEL_POSITION', emoji: '🚢', label: 'Vessel Positions', count: categoryCounts.VESSEL_POSITION },
                { key: 'FIXTURE_RECAP', emoji: '📋', label: 'Fixture Recaps', count: categoryCounts.FIXTURE_RECAP },
                { key: 'DOCUMENT', emoji: '📄', label: 'Documents', count: categoryCounts.DOCUMENT },
                { key: 'CLIENT_REPLY', emoji: '💬', label: 'Client Replies', count: categoryCounts.CLIENT_REPLY },
                { key: 'OTHER', emoji: '📁', label: 'Other', count: categoryCounts.OTHER },
              ] as { key: string; emoji: string; label: string; count: number }[]).filter(item => item.count > 0).map(({ key, emoji, label, count }) => (
                <div key={key} className="flex items-center justify-between py-0.5 px-2">
                  <span className="text-sm text-gray-600">{emoji} {label}</span>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </summary>
          <div className="bg-gray-50 px-4 py-4 space-y-3" id="inbox">
            <div id="cargo">
              <CategorySection
                category="CARGO_INQUIRY"
                rows={cargoRows}
                totalCount={categoryCounts.CARGO_INQUIRY}
              />
            </div>
            <div>
              <CategorySection
                category="VESSEL_POSITION"
                rows={vesselRows}
                totalCount={categoryCounts.VESSEL_POSITION}
              />
            </div>
            <div id="fixture">
              <CategorySection
                category="FIXTURE_RECAP"
                rows={fixtureRows}
                totalCount={categoryCounts.FIXTURE_RECAP}
              />
            </div>
            {(categoryCounts.DOCUMENT + categoryCounts.CLIENT_REPLY + categoryCounts.OTHER) > 0 && (
              <details className="border border-gray-200 rounded-lg overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-gray-50 list-none">
                  <span className="font-medium text-gray-800">Other</span>
                  <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                    {categoryCounts.DOCUMENT + categoryCounts.CLIENT_REPLY + categoryCounts.OTHER}
                  </span>
                </summary>
                <div className="bg-white px-4 pb-4 pt-2 space-y-1">
                  {otherRows.map((row) => (
                    <EmailListItem key={row.email.id} row={row} href={`/cargo/${row.email.id}`} />
                  ))}
                </div>
              </details>
            )}
          </div>
        </details>

        {/* ── MATCHES ── */}
        {goodMatches.length > 0 && (
          <div id="matches">
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              🔗 Vessel-Cargo Matches ({goodMatches.length})
            </h2>
            <div className="space-y-2">
              {goodMatches.map((match, i) => (
                <Link key={i} href={`/match/${i}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 bg-white">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {match.matchReasons[0] || `Match #${i + 1}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        Level: {match.matchLevel} · {match.matchReasons.length} reasons
                      </p>
                    </div>
                    <span className={`shrink-0 ml-3 px-2 py-0.5 rounded text-xs font-semibold ${match.matchLevel === 'good' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {match.matchLevel}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIVE NEGOTIATIONS ── */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Active Negotiations (recap ready)
          </h2>
          {activeRecaps.length === 0 ? (
            <p className="text-sm text-gray-400 bg-white border border-gray-200 rounded-lg px-4 py-3">
              No active negotiations found. Recaps are generated for threads with 5+ messages.
            </p>
          ) : (
            <div className="space-y-2">
              {activeRecaps.map((recap) => {
                const agreed = recap.points.filter((p) => p.status === 'AGREED').length;
                return (
                  <Link key={recap.threadId} href={`/recap/${recap.threadId}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 bg-white">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{recap.subject}</p>
                        <p className="text-xs text-gray-500">
                          {recap.emailCount} emails · {recap.dateRange} · {agreed}/{recap.points.length} terms agreed
                        </p>
                      </div>
                      <span className="shrink-0 ml-3 text-xs text-gray-400">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── YOUR NETWORK ── */}
        {topContacts.length > 0 && (
          <details className="border border-gray-300 rounded-xl overflow-hidden">
            <summary className="flex items-center justify-between px-5 py-4 bg-white cursor-pointer hover:bg-gray-50 list-none">
              <span className="font-semibold text-gray-900">Your Network</span>
              <span className="text-sm text-gray-500">from {emails.length} emails</span>
            </summary>
            <div className="bg-white px-4 pb-4 pt-2">
              {topContacts.map((contact, idx) => {
                const barWidth = Math.round((contact.count / maxContactEmails) * 100);
                return (
                  <div key={idx} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                        <span className="shrink-0 ml-3 text-xs font-semibold text-gray-600">
                          {contact.count} {contact.count === 1 ? 'email' : 'emails'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-400 rounded-full"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* ── DISCLAIMER ── */}
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-xs text-yellow-800">
            <strong>⚠️ Disclaimer:</strong> This analysis is generated by AI and may contain errors or omissions.
            All information should be independently verified before making business decisions.
            Commission estimates are based on extracted recap data and may not reflect final agreed amounts.
          </p>
        </div>

        {/* ── FOOTER CTA ── */}
        <div className="flex justify-end">
          <Link
            href="/summary"
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            View Summary &amp; Impact →
          </Link>
        </div>
      </div>
    </main>
  );
}
