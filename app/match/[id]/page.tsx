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
import { ClickableField } from '@/components/clickable-field';

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
  const vesselEmail = session.emails.find(e => e.id === match.vesselEmailId);

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
            <CardContent className="space-y-1">
              {cargo?.cargoDescription && (
                <ClickableField
                  label="Cargo"
                  value={cargo.cargoDescription.value}
                  confidence={cargo.cargoDescription.confidence}
                  sourceText={cargo.cargoDescription.sourceText}
                  emailBody={cargoEmail?.body || cargoEmail?.snippet || ''}
                  emailFrom={cargoEmail?.from || ''}
                  emailDate={cargoEmail?.date || ''}
                  emailSubject={cargoEmail?.subject || ''}
                />
              )}
              {cargo?.weightMt && (
                <ClickableField
                  label="Weight"
                  value={cargo.weightMt.value}
                  unit="MT"
                  confidence={cargo.weightMt.confidence}
                  sourceText={cargo.weightMt.sourceText}
                  emailBody={cargoEmail?.body || cargoEmail?.snippet || ''}
                  emailFrom={cargoEmail?.from || ''}
                  emailDate={cargoEmail?.date || ''}
                  emailSubject={cargoEmail?.subject || ''}
                />
              )}
              {(cargo?.originPort || cargo?.destinationPort) && (
                <p className="text-sm">{safeRender(cargo?.originPort) || '?'} → {safeRender(cargo?.destinationPort) || '?'}</p>
              )}
              {cargo?.cargoType && <p className="text-sm">Type: {safeRender(cargo.cargoType)}</p>}
              {cargo?.specialRequirements && <p className="text-sm">{safeRender(cargo.specialRequirements)}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">🚢 Vessel</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm font-semibold">{safeRender(vessel?.vesselName) || 'Unknown vessel'}</p>
              {vessel?.dwtSummer && (
                <ClickableField
                  label="DWT"
                  value={vessel.dwtSummer.value}
                  unit="MT"
                  confidence={vessel.dwtSummer.confidence}
                  sourceText={vessel.dwtSummer.sourceText}
                  emailBody={vesselEmail?.body || vesselEmail?.snippet || ''}
                  emailFrom={vesselEmail?.from || ''}
                  emailDate={vesselEmail?.date || ''}
                  emailSubject={vesselEmail?.subject || ''}
                />
              )}
              {vessel?.openPosition && (
                <ClickableField
                  label="Open"
                  value={vessel.openPosition.value}
                  confidence={vessel.openPosition.confidence}
                  sourceText={vessel.openPosition.sourceText}
                  emailBody={vesselEmail?.body || vesselEmail?.snippet || ''}
                  emailFrom={vesselEmail?.from || ''}
                  emailDate={vesselEmail?.date || ''}
                  emailSubject={vesselEmail?.subject || ''}
                />
              )}
              {vessel?.openDate && (
                <ClickableField
                  label="Date"
                  value={vessel.openDate.value}
                  confidence={vessel.openDate.confidence}
                  sourceText={vessel.openDate.sourceText}
                  emailBody={vesselEmail?.body || vesselEmail?.snippet || ''}
                  emailFrom={vesselEmail?.from || ''}
                  emailDate={vesselEmail?.date || ''}
                  emailSubject={vesselEmail?.subject || ''}
                />
              )}
              <p className="text-sm">{isGeared ? 'Geared' : 'Gearless'}{vessel?.vesselType ? `, ${safeRender(vessel.vesselType)}` : ''}</p>
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

        {match.hardFilters && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">🛡 Physical feasibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(() => {
                const hf = match.hardFilters!;
                const rows: { label: string; pass: boolean; reason?: string }[] = [
                  { label: 'Port draft vs vessel draft',     pass: hf.draft.pass,       reason: hf.draft.reason },
                  { label: 'Cargo handling (cranes/geared)', pass: hf.crane.pass,       reason: hf.crane.reason },
                  { label: 'Cargo volume vs hold capacity',  pass: hf.volume.pass,      reason: hf.volume.reason },
                  { label: 'Cargo type vs vessel type',      pass: hf.cargoVessel.pass, reason: hf.cargoVessel.reason },
                ];
                return rows.map((row, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={row.pass ? 'text-green-600 shrink-0' : 'text-red-600 shrink-0'}>
                      {row.pass ? '✓' : '✗'}
                    </span>
                    <span className="flex-1">
                      <span className="text-gray-800">{row.label}</span>
                      {row.reason && (
                        <span className={`block text-xs ${row.pass ? 'text-gray-500' : 'text-red-600'}`}>
                          {row.reason}
                        </span>
                      )}
                    </span>
                  </div>
                ));
              })()}
              <p className="text-xs text-gray-400 pt-2 border-t mt-2">
                Matches failing any hard check are filtered out before this page. What you see here passed all deterministic checks.
              </p>
            </CardContent>
          </Card>
        )}

        {match.sanctions && match.sanctions.risk !== 'NONE' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">⚠ Sanctions &amp; restrictions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(() => {
                const s = match.sanctions!;
                const riskConfig: Record<string, { label: string; color: string }> = {
                  HIGH:   { label: 'HIGH RISK',   color: 'bg-red-100 text-red-800' },
                  MEDIUM: { label: 'MEDIUM RISK', color: 'bg-yellow-100 text-yellow-800' },
                  LOW:    { label: 'LOW RISK',    color: 'bg-blue-100 text-blue-800' },
                  NONE:   { label: 'NO RISK',     color: 'bg-gray-100 text-gray-700' },
                };
                const rc = riskConfig[s.risk];
                return (
                  <>
                    <Badge className={rc.color + ' text-xs px-2 py-0.5'}>{rc.label}</Badge>
                    {s.reason && <p className="text-gray-700">{s.reason}</p>}
                    <p className="text-xs text-gray-400 border-t pt-2">
                      Screening is indicative — broker must verify against current OFAC/EU/UK sanctions lists before fixing.
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {match.scoreBreakdown && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">📊 Score breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {match.scoreBreakdown.components.map((c, i) => {
                const pct = c.max > 0 ? Math.max(0, Math.min(100, (c.points / c.max) * 100)) : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="font-medium">{c.label}</span>
                      <span className="text-gray-600">{c.points}/{c.max}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                    {c.reason && <p className="text-xs text-gray-500">{c.reason}</p>}
                  </div>
                );
              })}
              <div className="border-t pt-3 text-xs text-gray-600 grid grid-cols-2 gap-x-4 gap-y-1">
                <p>Base physical: {match.scoreBreakdown.basePhysical}</p>
                {match.scoreBreakdown.readinessAdjustment !== 0 && (
                  <p>Readiness adj: {match.scoreBreakdown.readinessAdjustment > 0 ? '+' : ''}{match.scoreBreakdown.readinessAdjustment}</p>
                )}
                {match.scoreBreakdown.sanctionsAdjustment !== 0 && (
                  <p>Sanctions adj: {match.scoreBreakdown.sanctionsAdjustment}</p>
                )}
              </div>
              <p className="text-sm font-semibold border-t pt-2">Final score: {match.scoreBreakdown.finalScore}</p>
            </CardContent>
          </Card>
        )}

        {match.readiness && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">⏱ Vessel readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(() => {
                const r = match.readiness;
                const verdictConfig: Record<string, { label: string; color: string }> = {
                  ideal:   { label: 'IDEAL TIMING',   color: 'bg-green-100 text-green-800' },
                  tight:   { label: 'TIGHT TIMING',   color: 'bg-yellow-100 text-yellow-800' },
                  idle:    { label: 'VESSEL IDLE',    color: 'bg-orange-100 text-orange-800' },
                  late:    { label: 'ARRIVES LATE',   color: 'bg-red-100 text-red-800' },
                  unknown: { label: 'UNKNOWN',        color: 'bg-gray-100 text-gray-700' },
                };
                const vc = verdictConfig[r.verdict];
                return (
                  <>
                    <Badge className={vc.color + ' text-xs px-2 py-0.5'}>{vc.label}</Badge>
                    <p className="text-gray-700">{r.explanation}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 pt-2 border-t">
                      {r.distanceNm != null && <p>Distance: {r.distanceNm} NM</p>}
                      {r.speedKn != null && <p>Speed: {r.speedKn} kn</p>}
                      {r.sailingDays != null && <p>Sailing: ~{r.sailingDays.toFixed(1)} d</p>}
                      {r.gapDays != null && (
                        <p>
                          Gap to laycan:{' '}
                          <span className={r.gapDays >= 0 ? 'text-gray-700' : 'text-red-700'}>
                            {r.gapDays > 0 ? '+' : ''}{r.gapDays.toFixed(1)} d
                          </span>
                        </p>
                      )}
                      {r.arrivalDate && <p>Est. arrival: {r.arrivalDate}</p>}
                      {r.laycanStart && r.laycanEnd && <p>Laycan: {r.laycanStart} → {r.laycanEnd}</p>}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {cargoEmail && <DraftQuoteCard emailId={cargoEmail.id} />}
      </div>
    </main>
  );
}
