import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from 'lucide-react';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { safeRender } from '@/lib/ui-render';
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
  const idx = parseInt(id, 10);
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');
  if (isNaN(idx) || idx < 0 || idx >= session.matches.length) notFound();

  const match = session.matches[idx];
  const cargo = session.parsedCargos.find(
    c => c.emailId === match.cargoEmailId && c.itemIndex === match.cargoItemIndex,
  );
  const vessel = session.parsedVessels.find(
    v => v.emailId === match.vesselEmailId && v.itemIndex === match.vesselItemIndex,
  );
  const cargoEmail = session.emails.find(e => e.id === match.cargoEmailId);

  const vesselName = vessel?.vesselName ? safeRender(vessel.vesselName.value) : 'Unknown vessel';
  const dwtDisplay = vessel?.dwtSummer ? `${safeRender(vessel.dwtSummer.value)} MT` : null;
  const badgeCfg = MATCH_LEVEL_BADGE[match.matchLevel] ?? MATCH_LEVEL_BADGE.possible;
  const borderClass = getConfidenceColorClass(match.confidence?.level ?? 'missing');

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'match' }} />
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        {/* Sticky header */}
        <div className={`sticky top-0 z-10 bg-white border-b-2 ${borderClass} rounded-t-lg px-4 py-3 flex items-center justify-between gap-3 shadow-sm`}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-semibold text-sm sm:text-base truncate">{vesselName}</span>
            {dwtDisplay && (
              <span className="text-xs text-gray-500 shrink-0">{dwtDisplay}</span>
            )}
          </div>
          <Badge className={`${badgeCfg.color} text-xs px-2 py-0.5 shrink-0`}>
            {badgeCfg.label}
          </Badge>
        </div>

        {/* Action buttons row — γv-11 + γv-12 slot */}
        {process.env.EXPLAIN_DEAL_ENABLED === 'true' && (
          <div className="flex flex-wrap items-center gap-2 px-1">
            {/* γv-11: Explain this deal */}
            <ExplainDealModal matchIndex={idx} language="en" />
            {/* γv-12 slot: RouteMapButton goes here — do not modify this comment */}
          </div>
        )}

        {/* Tabs */}
        <MatchTabs
          match={match}
          vessel={vessel}
          cargo={cargo}
          cargoEmailId={cargoEmail?.id}
        />

        {/* Source attribution split-view for key cargo fields */}
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
      </div>
    </main>
  );
}
