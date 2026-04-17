import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { filterByCategory, getEmailCounts } from '@/lib/dashboard-queries';
import { EmailCard, EmailSection, ActionPanel } from '@/components/dashboard';
import { AnalyticsTracker } from '@/lib/analytics-tracker';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');
  const { emails, processedEmails, matches, recaps, commissionSummary, blockedMatches: rawBlockedMatches } = session;
  const blockedMatches = rawBlockedMatches || [];
  const sanctionsBlocked = blockedMatches.filter((b) => b.sanctions?.blocking);
  const filterBlocked = blockedMatches.filter((b) => !b.sanctions?.blocking);

  if (emails.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold text-gray-900">No emails yet</h1>
          <p className="text-sm text-gray-500">Load your emails to start analyzing cargo inquiries, vessel positions, and negotiations.</p>
          <Link href="/processing" className="inline-block px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">Загрузить письма</Link>
        </div>
      </main>
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
  const oldestDays = needsActionCargo.length > 0
    ? Math.max(...needsActionCargo.map((r) => r.processed.daysWithoutReply || 0))
    : 0;
  const goodMatches = matches.filter((m) => m.matchLevel === 'good' || m.matchLevel === 'possible');
  const commissionLines = commissionSummary?.totalByCurrency
    .map((t) => `~${t.currency} ${t.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
    .join(' + ') || null;
  const categoryCounts = getEmailCounts({ CARGO_INQUIRY: cargoRows, VESSEL_POSITION: vesselRows, FIXTURE_RECAP: fixtureRows, CLIENT_REPLY: clientReplyRows, DOCUMENT: documentRows, VESSEL_CERTIFICATE: vesselCertRows, TCT_REQUEST: tctRequestRows, OTHER: otherOnlyRows });
  const isSample = session.isSampleData === true;
  const senderMap = new Map<string, { name: string; count: number }>();
  for (const email of emails) {
    const key = (email.fromEmail || email.from || '').toLowerCase().trim();
    if (!key) continue;
    const existing = senderMap.get(key);
    if (existing) { existing.count += 1; }
    else { senderMap.set(key, { name: email.fromName || email.fromEmail || email.from || key, count: 1 }); }
  }
  const topContacts = Array.from(senderMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  const maxContactEmails = topContacts.length > 0 ? topContacts[0].count : 1;

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="dashboard_viewed" />
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Good morning. Here&apos;s what needs your attention:</h1>
          <p className="text-sm text-gray-500 mt-1">{emails.length} emails processed{blockedMatches.length > 0 && ` • ${blockedMatches.length} blocked`}</p>
          {isSample && <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Sample data</span>}
        </div>
        <ActionPanel needsActionCargo={needsActionCargo} goodMatches={goodMatches} fixtureRows={fixtureRows} commissionSummary={commissionSummary} commissionLines={commissionLines} oldestDays={oldestDays} />
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
                { key: 'VESSEL_CERTIFICATE', emoji: '📜', label: 'Vessel Certificates', count: categoryCounts.VESSEL_CERTIFICATE },
                { key: 'TCT_REQUEST', emoji: '⏱', label: 'TCT Requests', count: categoryCounts.TCT_REQUEST },
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
            <div id="cargo"><EmailSection category="CARGO_INQUIRY" rows={cargoRows} totalCount={categoryCounts.CARGO_INQUIRY} /></div>
            <div><EmailSection category="VESSEL_POSITION" rows={vesselRows} totalCount={categoryCounts.VESSEL_POSITION} /></div>
            <div id="fixture"><EmailSection category="FIXTURE_RECAP" rows={fixtureRows} totalCount={categoryCounts.FIXTURE_RECAP} /></div>
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
            {(categoryCounts.DOCUMENT + categoryCounts.CLIENT_REPLY + categoryCounts.OTHER) > 0 && (
              <details className="border border-gray-200 rounded-lg overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-gray-50 list-none">
                  <span className="font-medium text-gray-800">Other</span>
                  <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">{categoryCounts.DOCUMENT + categoryCounts.CLIENT_REPLY + categoryCounts.OTHER}</span>
                </summary>
                <div className="bg-white px-4 pb-4 pt-2 space-y-1">
                  {otherRows.map((row) => <EmailCard key={row.email.id} row={row} href={`/cargo/${row.email.id}`} />)}
                </div>
              </details>
            )}
          </div>
        </details>
        {goodMatches.length > 0 && (
          <div id="matches">
            <h2 className="text-base font-semibold text-gray-900 mb-3">🔗 Vessel-Cargo Matches ({goodMatches.length})</h2>
            <div className="space-y-2">
              {goodMatches.map((match, i) => {
                const r = match.readiness;
                const readinessBadge = r && r.gapDays != null
                  ? (() => {
                      const days = Math.round(r.gapDays);
                      const abs = Math.abs(days);
                      if (r.verdict === 'ideal') return { label: `⏱ +${abs}d ideal`, color: 'text-green-700' };
                      if (r.verdict === 'tight') return { label: `⏱ ~${abs}d tight`, color: 'text-yellow-700' };
                      if (r.verdict === 'idle') return { label: `⏱ +${abs}d idle`, color: 'text-orange-700' };
                      if (r.verdict === 'late') return { label: `⏱ −${abs}d late`, color: 'text-red-700' };
                      return null;
                    })()
                  : null;
                return (
                  <Link key={i} href={`/match/${i}`} className="block focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 rounded-lg">
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 bg-white">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{match.matchReasons[0] || `Match #${i + 1}`}</p>
                        <p className="text-xs text-gray-500">
                          Level: {match.matchLevel} · {match.matchReasons.length} reasons
                          {readinessBadge && (
                            <> · <span className={`font-medium ${readinessBadge.color}`}>{readinessBadge.label}</span></>
                          )}
                        </p>
                      </div>
                      <span className={`shrink-0 ml-3 px-2 py-0.5 rounded text-xs font-semibold ${match.matchLevel === 'good' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{match.matchLevel}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {/* Blocked Matches */}
        {blockedMatches.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-red-700 mb-3">
              🚫 Blocked Pairs ({blockedMatches.length})
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              These cargo-vessel pairs were filtered out before matching due to sanctions,
              physical constraints, or compatibility issues.
            </p>
            {sanctionsBlocked.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-1">
                  ⛔ Sanctions ({sanctionsBlocked.length})
                </h3>
                <div className="space-y-2">
                  {sanctionsBlocked.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                      <span className="font-medium text-red-800">⛔</span>
                      <div className="flex-1">
                        <span className="font-medium">{b.cargoEmailId}</span>
                        <span className="text-gray-400 mx-1">×</span>
                        <span className="font-medium">{b.vesselEmailId}</span>
                      </div>
                      <span className="text-red-600 text-xs max-w-sm truncate">{b.filterReason}</span>
                      <span className="px-2 py-0.5 bg-red-600 text-white text-xs rounded-full">SANCTIONS</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {filterBlocked.length > 0 && (
              <details className="border border-orange-200 rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 bg-orange-50 cursor-pointer hover:bg-orange-100 list-none">
                  <span className="text-sm font-semibold text-orange-800">🚫 Hard Filter Fails ({filterBlocked.length})</span>
                  <span className="text-orange-500 text-xs select-none">▼</span>
                </summary>
                <div className="bg-white px-4 pb-4 pt-2 space-y-2">
                  {filterBlocked.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                      <span className="font-medium text-orange-700">🚫</span>
                      <div className="flex-1">
                        <span className="font-medium">{b.cargoEmailId}</span>
                        <span className="text-gray-400 mx-1">×</span>
                        <span className="font-medium">{b.vesselEmailId}</span>
                      </div>
                      <span className="text-orange-600 text-xs max-w-sm truncate">{b.filterReason}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Active Negotiations (recap ready)</h2>
          {recaps.length === 0 ? (
            <p className="text-sm text-gray-400 bg-white border border-gray-200 rounded-lg px-4 py-3">No active negotiations found. Recaps are generated for threads with 5+ messages.</p>
          ) : (
            <div className="space-y-2">
              {recaps.map((recap) => (
                <Link key={recap.threadId} href={`/recap/${recap.threadId}`} className="block focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 rounded-lg">
                  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 bg-white">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{recap.subject}</p>
                      <p className="text-xs text-gray-500">{recap.emailCount} emails · {recap.dateRange} · {recap.points.filter(p => p.status === 'AGREED').length}/{recap.points.length} terms agreed</p>
                    </div>
                    <span className="shrink-0 ml-3 text-xs text-gray-400">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        {topContacts.length > 0 && (
          <details className="border border-gray-300 rounded-xl overflow-hidden">
            <summary className="flex items-center justify-between px-5 py-4 bg-white cursor-pointer hover:bg-gray-50 list-none">
              <span className="font-semibold text-gray-900">Your Network</span>
              <span className="text-sm text-gray-500">from {emails.length} emails</span>
            </summary>
            <div className="bg-white px-4 pb-4 pt-2">
              {topContacts.map((contact, idx) => (
                <div key={idx} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                      <span className="shrink-0 ml-3 text-xs font-semibold text-gray-600">{contact.count} {contact.count === 1 ? 'email' : 'emails'}</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round((contact.count / maxContactEmails) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-xs text-yellow-800">
            <strong>⚠️ Disclaimer:</strong> This analysis is generated by AI and may contain errors or omissions.
            All information should be independently verified before making business decisions.
            Commission estimates are based on extracted recap data and may not reflect final agreed amounts.
          </p>
        </div>
        <div className="flex justify-end">
          <Link href="/summary" className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
            View Summary &amp; Impact →
          </Link>
        </div>
      </div>
    </main>
  );
}
