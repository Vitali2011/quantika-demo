import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { getMatch } from '@/lib/matching/matches-repository';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from 'lucide-react';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { getConfidenceColorClass } from '@/lib/confidence';
import { MatchTabs } from '@/components/match/MatchTabs';
import { SourceAttributionSection } from '@/components/match/SourceAttributionSection';
import { ExplainDealModal } from '@/components/match/ExplainDealModal';

interface Props { params: Promise<{ id: string }>; }

const MATCH_LEVEL_BADGE: Record<string, { label: string; color: string }> = {
  good:     { label: '✅ GOOD MATCH',     color: 'bg-green-100 text-green-800' },
  possible: { label: '🟡 POSSIBLE MATCH', color: 'bg-yellow-100 text-yellow-800' },
  weak:     { label: '⚠️ WEAK MATCH',     color: 'bg-orange-100 text-orange-800' },
};

export default async function MatchDetailPage({ params }: Props) {
  const { id } = await params;
  const dbId = parseInt(id, 10);

  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  if (isNaN(dbId) || dbId < 1) notFound();

  const db = getStore().getDatabase();
  const storedMatch = getMatch(db, dbId);

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
  const borderClass = sessionMatch
    ? getConfidenceColorClass(sessionMatch.confidence?.level ?? 'missing')
    : 'border-gray-200';

  const laycanStart = storedMatch.laycan_start
    ? new Date(storedMatch.laycan_start).toLocaleDateString()
    : null;
  const laycanEnd = storedMatch.laycan_end
    ? new Date(storedMatch.laycan_end).toLocaleDateString()
    : null;
  const laycanDisplay =
    laycanStart && laycanEnd
      ? `${laycanStart} – ${laycanEnd}`
      : (laycanStart ?? laycanEnd ?? null);

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'match' }} />
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <Link
          href="/matches"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Matches
        </Link>

        {/* Sticky header */}
        <div className={`sticky top-0 z-10 bg-white border-b-2 ${borderClass} rounded-t-lg px-4 py-3 flex items-center justify-between gap-3 shadow-sm`}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-semibold text-sm sm:text-base truncate">
              {storedMatch.vessel_id}
            </span>
            {storedMatch.vessel_dwt && (
              <span className="text-xs text-gray-500 shrink-0">
                {storedMatch.vessel_dwt.toLocaleString()} DWT
              </span>
            )}
          </div>
          {badgeCfg && (
            <Badge className={`${badgeCfg.color} text-xs px-2 py-0.5 shrink-0`}>
              {badgeCfg.label}
            </Badge>
          )}
        </div>

        {/* M3 fields overview */}
        <div className="bg-white rounded-lg border p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Match Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {storedMatch.cargo_type && (
              <>
                <dt className="text-gray-500">Cargo Type</dt>
                <dd className="font-medium capitalize">{storedMatch.cargo_type}</dd>
              </>
            )}
            {storedMatch.load_port && (
              <>
                <dt className="text-gray-500">Load Port</dt>
                <dd className="font-medium">{storedMatch.load_port}</dd>
              </>
            )}
            {storedMatch.discharge_port && (
              <>
                <dt className="text-gray-500">Discharge Port</dt>
                <dd className="font-medium">{storedMatch.discharge_port}</dd>
              </>
            )}
            {laycanDisplay && (
              <>
                <dt className="text-gray-500">Laycan</dt>
                <dd className="font-medium">{laycanDisplay}</dd>
              </>
            )}
            {storedMatch.vessel_dwt && (
              <>
                <dt className="text-gray-500">Vessel DWT</dt>
                <dd className="font-medium">{storedMatch.vessel_dwt.toLocaleString()} MT</dd>
              </>
            )}
            <dt className="text-gray-500">Score</dt>
            <dd className="font-medium text-blue-600">{storedMatch.score}%</dd>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium capitalize">{storedMatch.status}</dd>
          </dl>
        </div>

        {/* Rich tabs — only when session match is still available */}
        {sessionMatch && (
          <>
            {process.env.EXPLAIN_DEAL_ENABLED === 'true' && (
              <div className="flex flex-wrap items-center gap-2 px-1">
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
              cargoEmailId={cargoEmail?.id}
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
      </div>
    </main>
  );
}
