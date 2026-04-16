import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from 'lucide-react';
import { Renderable } from '@/lib/types';
import { DraftQuoteCard } from '@/components/request/draft-quote-card';
import { AnalyticsTracker } from '@/lib/analytics-tracker';

function safeRender(v: Renderable): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return safeRender(v.value);
  return JSON.stringify(v);
}

interface Props { params: Promise<{ id: string }>; }

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
  const cargo = session.parsedCargos.find(c => c.emailId === match.cargoEmailId && c.itemIndex === match.cargoItemIndex);
  const vessel = session.parsedVessels.find(v => v.emailId === match.vesselEmailId && v.itemIndex === match.vesselItemIndex);
  const cargoEmail = session.emails.find(e => e.id === match.cargoEmailId);

  const levelConfig: Record<string, { label: string; color: string; heading: string }> = {
    good: { label: '✅ GOOD MATCH', color: 'bg-green-100 text-green-800', heading: "here's why:" },
    possible: { label: '🟡 POSSIBLE MATCH', color: 'bg-yellow-100 text-yellow-800', heading: "here's why:" },
    weak: { label: '⚠️ WEAK MATCH', color: 'bg-orange-100 text-orange-800', heading: 'limited compatibility:' },
  };
  const cfg = levelConfig[match.matchLevel] || levelConfig.possible;

  // Determine geared safely
  const gearedVal = vessel?.geared;
  const isGeared = gearedVal === true || safeRender(gearedVal) === 'Yes';

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'match' }} />
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <h1 className="text-base sm:text-lg font-bold">CARGO ↔ VESSEL MATCH</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">📦 Cargo</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><strong>{safeRender(cargo?.cargoDescription) || 'Unknown cargo'}</strong></p>
              {safeRender(cargo?.weightMt) && safeRender(cargo?.weightMt) !== '0' && <p>{safeRender(cargo?.weightMt)} MT</p>}
              <p>{safeRender(cargo?.originPort) || '?'} → {safeRender(cargo?.destinationPort) || '?'}</p>
              {cargo?.cargoType && <p>Type: {safeRender(cargo.cargoType)}</p>}
              {cargo?.specialRequirements && <p>{safeRender(cargo.specialRequirements)}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">🚢 Vessel</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><strong>{safeRender(vessel?.vesselName) || 'Unknown vessel'}</strong></p>
              <p>{safeRender(vessel?.dwtSummer) || '?'} DWT</p>
              <p>Open: {safeRender(vessel?.openPosition) || '?'}</p>
              {vessel?.openDate && <p>{safeRender(vessel.openDate)}</p>}
              <p>{isGeared ? 'Geared' : 'Gearless'}{vessel?.vesselType ? `, ${safeRender(vessel.vesselType)}` : ''}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Badge className={cfg.color + ' text-sm px-3 py-1'}>{cfg.label}</Badge>
              <span className="text-sm ml-2 text-muted-foreground">— {cfg.heading}</span>
            </div>

            {match.matchReasons.length > 0 && (
              <ul className="space-y-1">
                {match.matchReasons.map((reason, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-green-600 shrink-0">•</span>
                    {safeRender(reason)}
                  </li>
                ))}
              </ul>
            )}

            {match.issues.length > 0 && (
              <div>
                <p className="text-sm font-medium text-yellow-700">⚠️ Check before proceeding:</p>
                <ul className="mt-1 space-y-1">
                  {match.issues.map((issue, i) => (
                    <li key={i} className="text-sm flex items-start gap-2 text-yellow-700">
                      <span className="shrink-0">•</span>
                      {safeRender(issue)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {cargoEmail && <DraftQuoteCard emailId={cargoEmail.id} />}
      </div>
    </main>
  );
}
