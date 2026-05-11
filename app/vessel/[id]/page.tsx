import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ship, MapPin, Calendar, ChevronLeft } from 'lucide-react';
import { Renderable } from '@/lib/types';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { ClickableField } from '@/components/clickable-field';
import { safeRender, getConf, ConfIcon } from '@/lib/ui-render';
import { formatDate } from '@/lib/utils';
import { lookupCii } from '@/lib/imo/cii-lookup';
import { CiiRatingBadge } from '@/components/vessel/CiiRatingBadge';
import { SanctionsBadge } from '@/components/vessel/SanctionsBadge';

// Only the three canonical string labels are valid. Guard against numeric
// confidence scores from the parser reaching the ConfIcon branch — a truthy
// number would render a space-only text-node Fragment, triggering React #418.
const VALID_CONF = new Set(['confirmed', 'interpreted', 'uncertain']);

function Spec({ label, value, unit, confidence }: { label: string; value: Renderable; unit?: string; confidence?: string }) {
  const rendered = safeRender(value);
  if (!rendered || rendered === 'NaN') return null;
  const confStr = typeof confidence === 'string' && VALID_CONF.has(confidence) ? confidence : undefined;
  return (
    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {rendered}{unit ? ` ${unit}` : ''}
        {confStr ? <> <ConfIcon confidence={confStr} /></> : null}
      </span>
    </div>
  );
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VesselDetailPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');

  const session = getSession(sessionId);
  if (!session) redirect('/');

  const email = session.emails.find(e => e.id === id);
  if (!email) notFound();

  const vessels = session.parsedVessels.filter(v => v.emailId === id);
  const processed = session.processedEmails.find(p => p.emailId === id);
  const matchingCargo = session.matches.filter(m => m.vesselEmailId === id);

  // Find if this vessel is involved in any sanctions-blocked pairs
  const sanctionsBlock = (session.blockedMatches ?? []).find(
    (b) => b.vesselEmailId === id && b.sanctions?.blocking,
  );

  // Pre-fetch CII ratings for all vessels on this page (server-side, cached 30 days)
  const ciiResults = await Promise.all(vessels.map(v => lookupCii(v.imo ?? '')));

  const emailMeta = {
    emailBody: email.body || email.snippet,
    emailFrom: email.from,
    emailDate: email.date,
    emailSubject: email.subject,
  };

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'vessel' }} />
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        {/* Sanctions blocked badge — shown only when vessel is in a sanctions-blocked pair */}
        {sanctionsBlock && (
          <SanctionsBadge reason={sanctionsBlock.filterReason} />
        )}

        <div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">VESSEL POSITION</Badge>
            {processed && (
              <span className="text-xs text-muted-foreground">
                {processed.freshness === 'stale' ? '⚠️ STALE — open date passed' : '🟢 Active'}
              </span>
            )}
          </div>
          <h1 className="text-lg sm:text-xl font-bold mt-2">{email.subject}</h1>
          <p className="text-sm text-muted-foreground">From: {email.from} · {formatDate(email.date)}</p>
          {processed?.expiryDate && <p className="text-xs text-muted-foreground">Active until {formatDate(processed.expiryDate)}</p>}
        </div>

        {/* Original email */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Original Email</CardTitle>
            <a href={`/email/${id}#highlight`} className="text-xs text-blue-500 hover:underline">View annotated →</a>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans overflow-x-auto">{email.body || email.snippet}</pre>
          </CardContent>
        </Card>

        {/* Vessel empty state */}
        {vessels.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500 mb-4">No vessel data parsed from this email.</p>
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
              <ChevronLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
          </div>
        )}

        {/* Parsed vessels */}
        {vessels.map((vessel, idx) => (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Ship className="h-4 w-4" />
                {safeRender(vessel.vesselName) || 'Unknown Vessel'}
                {vessels.length > 1 ? ` (#${idx + 1})` : ''}
                {VALID_CONF.has(getConf(vessel.vesselName) ?? '') && <ConfIcon confidence={getConf(vessel.vesselName)} />}
                {ciiResults[idx] && ciiResults[idx].rating !== 'unknown' && (
                  <CiiRatingBadge
                    rating={ciiResults[idx].rating}
                    year={ciiResults[idx].year}
                    source={ciiResults[idx].source}
                    size="medium"
                  />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Open position */}
              {(vessel.openPosition || vessel.openDate) && (
                <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                  <p className="text-sm font-medium text-blue-800">
                    <MapPin className="h-4 w-4 inline mr-1" />
                    Open: {safeRender(vessel.openPosition) || '?'}
                    {VALID_CONF.has(getConf(vessel.openPosition) ?? '') && <> <ConfIcon confidence={getConf(vessel.openPosition)} /></>}
                  </p>
                  {vessel.openDate && (
                    <p className="text-sm text-blue-700">
                      <Calendar className="h-4 w-4 inline mr-1" />
                      Date: {safeRender(vessel.openDate)}
                      {VALID_CONF.has(getConf(vessel.openDate) ?? '') && <> <ConfIcon confidence={getConf(vessel.openDate)} /></>}
                    </p>
                  )}
                  {vessel.direction && <p className="text-xs text-blue-600">Direction: {safeRender(vessel.direction)}</p>}
                </div>
              )}

              {/* Specs */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Specifications</h4>
                <ClickableField
                  label="DWT (summer)"
                  value={vessel.dwtSummer?.value ?? null}
                  unit="MT"
                  confidence={vessel.dwtSummer?.confidence}
                  sourceText={vessel.dwtSummer?.sourceText}
                  {...emailMeta}
                />
                <ClickableField
                  label="DWCC"
                  value={vessel.dwcc?.value ?? null}
                  unit="MT"
                  confidence={vessel.dwcc?.confidence}
                  sourceText={vessel.dwcc?.sourceText}
                  {...emailMeta}
                />
                <ClickableField
                  label="Draft (max)"
                  value={vessel.draftMax?.value ?? null}
                  unit="m"
                  confidence={vessel.draftMax?.confidence}
                  sourceText={vessel.draftMax?.sourceText}
                  {...emailMeta}
                />
                <Spec label="LOA" value={vessel.loa} unit="m" />
                <Spec label="Beam" value={vessel.beam} unit="m" />
                <Spec label="Built" value={vessel.built} />
                <Spec label="Flag" value={vessel.flag} />
                <Spec label="Type" value={vessel.vesselType} />
                <Spec label="Holds/Hatches" value={vessel.holdsCount != null ? `${safeRender(vessel.holdsCount)} HO / ${safeRender(vessel.hatchesCount) || '?'} HA` : null} />
                <Spec label="Grain Capacity" value={vessel.grainCapacity} unit={safeRender(vessel.grainCapacityUnit) || 'cbm'} />
                <Spec label="Geared" value={vessel.geared != null ? (safeRender(vessel.geared) === 'Yes' ? 'Yes' : 'No (gearless)') : null} />
                {(vessel.geared === true || safeRender(vessel.geared) === 'Yes') && <Spec label="Crane Capacity" value={vessel.craneCapacity} />}
                <Spec label="GRT/NRT" value={vessel.grt != null ? `${safeRender(vessel.grt)} / ${safeRender(vessel.nrt) || '?'}` : null} />
              </div>

              {/* Restrictions & features */}
              {vessel.restrictions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">Restrictions</h4>
                  <div className="flex flex-wrap gap-1">
                    {vessel.restrictions.map((r, i) => <Badge key={i} variant="destructive" className="text-xs">{safeRender(r)}</Badge>)}
                  </div>
                </div>
              )}
              {vessel.lastCargoes && (
                <div className="text-sm"><span className="font-medium">Last cargoes:</span> {safeRender(vessel.lastCargoes)}</div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Matching cargo */}
        {matchingCargo.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">🔗 Matching Cargo Inquiries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {matchingCargo.map((match, i) => {
                const cargo = session.parsedCargos.find(c => c.emailId === match.cargoEmailId && c.itemIndex === match.cargoItemIndex);
                const levelLabel = match.matchLevel === 'good' ? '✅ GOOD' : match.matchLevel === 'possible' ? '🟡 POSSIBLE' : '⚠️ WEAK';
                return (
                  <Link key={i} href={`/match/${session.matches.indexOf(match)}`}>
                    <div className="p-3 rounded-lg border hover:bg-muted transition-colors cursor-pointer">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium">{cargo ? safeRender(cargo.cargoDescription) || 'Cargo' : 'Cargo'}</p>
                          <p className="text-xs text-muted-foreground">{match.matchReasons[0] || ''}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{levelLabel}</Badge>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
