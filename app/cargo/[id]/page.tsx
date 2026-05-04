import { sanitizeEmailBody, formatDate, formatNumber } from '@/lib/utils';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DraftQuoteCard } from '@/components/request/draft-quote-card';
import { Ship, FileText, AlertTriangle, ChevronLeft, Anchor } from 'lucide-react';
import { STATUS_CONFIG } from '@/lib/constants';
import { cfValue } from '@/lib/types';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { ClickableField } from '@/components/clickable-field';
import { safeRender, getConf, ConfIcon } from '@/lib/ui-render';

/**
 * βf2-02: Normalise specialRequirements before rendering.
 * The LLM parser sometimes returns an array of objects ({label, name, ...})
 * instead of the typed `string | null`. Coerce to readable text so the user
 * never sees "[object Object]" on the cargo page.
 *
 * Exported for unit testing (pure function, no React dependencies).
 */
export function renderSpecialRequirements(
  value: unknown,
): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return value
      .map((it) =>
        typeof it === 'string'
          ? it
          : (it as Record<string, unknown>).label ??
            (it as Record<string, unknown>).name ??
            JSON.stringify(it),
      )
      .join(', ');
  }
  return safeRender(value as Parameters<typeof safeRender>[0]);
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CargoDetailPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');

  const session = getSession(sessionId);
  if (!session) redirect('/');

  const email = session.emails.find(e => e.id === id);
  if (!email) notFound();

  const cargos = session.parsedCargos.filter(c => c.emailId === id);
  const processed = session.processedEmails.find(p => p.emailId === id);
  const matchingVessels = session.matches.filter(m => m.cargoEmailId === id);
  const statusCfg = processed ? STATUS_CONFIG[processed.status] : null;
  const emailMeta = {
    emailBody: email.body || email.snippet,
    emailFrom: email.from,
    emailDate: email.date,
    emailSubject: email.subject,
  };

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'cargo' }} />
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        {/* Back link */}
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">CARGO INQUIRY</Badge>
              {statusCfg && (
                <Badge className={statusCfg.color}>{statusCfg.emoji} {statusCfg.label}</Badge>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold mt-2">{safeRender(email.subject)}</h1>
            <p className="text-sm text-muted-foreground">
              From: {safeRender(email.from)} · {formatDate(email.date)}
            </p>
            {processed && (
              <p className="text-xs text-muted-foreground mt-1">
                {processed.freshness === 'stale'
                  ? '⚠️ STALE — laycan/dates expired'
                  : processed.expiryDate
                    ? `Active until ${formatDate(processed.expiryDate)}`
                    : 'Active'}
              </p>
            )}
          </div>
        </div>

        {/* Original Email */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Original Email</CardTitle>
            <a href={`/email/${id}#highlight`} className="text-xs text-blue-500 hover:underline">View annotated →</a>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans text-foreground overflow-x-auto">
              {sanitizeEmailBody(safeRender(email.body || email.snippet))}
            </pre>
          </CardContent>
        </Card>

        {/* AI Analysis — empty state */}
        {cargos.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500 mb-4">No AI analysis available for this cargo inquiry.</p>
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
              <ChevronLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
          </div>
        )}

        {/* AI Analysis — one card per cargo item */}
        {cargos.map((cargo, idx) => (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                AI Analysis {cargos.length > 1 ? `— Item ${idx + 1}` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-green-700">✅ Found:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

                  {/* Origin */}
                  {cargo.originPort && (
                    <ClickableField
                      label="Origin"
                      value={cargo.originPort.value + (cargo.originCountry ? `, ${cargo.originCountry}` : '')}
                      confidence={cargo.originPort.confidence}
                      sourceText={cargo.originPort.sourceText}
                      {...emailMeta}
                    />
                  )}

                  {/* Destination */}
                  {cargo.destinationPort && (
                    <ClickableField
                      label="Destination"
                      value={cargo.destinationPort.value + (cargo.destinationCountry ? `, ${cargo.destinationCountry}` : '')}
                      confidence={cargo.destinationPort.confidence}
                      sourceText={cargo.destinationPort.sourceText}
                      {...emailMeta}
                    />
                  )}

                  {/* Cargo description */}
                  {cargo.cargoDescription && (
                    <ClickableField
                      label="Cargo"
                      value={cargo.cargoDescription.value}
                      confidence={cargo.cargoDescription.confidence}
                      sourceText={cargo.cargoDescription.sourceText}
                      {...emailMeta}
                    />
                  )}

                  {/* Weight */}
                  {cargo.weightMt && (
                    <ClickableField
                      label="Weight"
                      value={cargo.weightMt.value}
                      unit="MT"
                      confidence={cargo.weightMt.confidence}
                      sourceText={cargo.weightMt.sourceText}
                      {...emailMeta}
                    />
                  )}

                  {/* Cargo type */}
                  {cargo.cargoType && (
                    <div className="flex items-center gap-2 text-sm">
                      <Ship className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Type:</span>
                      {safeRender(cargo.cargoType)}
                    </div>
                  )}

                  {/* Preferred dates */}
                  {cargo.preferredDates && (
                    <ClickableField
                      label="Dates"
                      value={cargo.preferredDates.value}
                      confidence={cargo.preferredDates.confidence}
                      sourceText={cargo.preferredDates.sourceText}
                      {...emailMeta}
                    />
                  )}

                  {/* Loading rate */}
                  {cargo.loadingRate && (
                    <div className="flex items-center gap-2 text-sm">
                      <Anchor className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Loading:</span>
                      {safeRender(cargo.loadingRate)}
                      <ConfIcon confidence={getConf(cargo.loadingRate)} />
                    </div>
                  )}

                  {/* Discharge rate */}
                  {cargo.dischargeRate && (
                    <div className="flex items-center gap-2 text-sm">
                      <Anchor className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Discharge:</span>
                      {safeRender(cargo.dischargeRate)}
                      <ConfIcon confidence={getConf(cargo.dischargeRate)} />
                    </div>
                  )}

                  {/* Commission */}
                  {cargo.commissionPercent != null && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">Commission:</span>
                      {safeRender(cargo.commissionPercent)}%{' '}
                      {safeRender(cargo.commissionTerms) || 'TTL'}
                    </div>
                  )}

                  {/* Special requirements */}
                  {cargo.specialRequirements && (
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Special:</span>
                      {renderSpecialRequirements(cargo.specialRequirements)}
                      <ConfIcon confidence={getConf(cargo.specialRequirements)} />
                    </div>
                  )}

                  {/* Incoterms */}
                  {cargo.incoterms && (
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Terms:</span>
                      {safeRender(cargo.incoterms)}
                      <ConfIcon confidence={getConf(cargo.incoterms)} />
                    </div>
                  )}

                </div>

                {/* Missing info warning */}
                {cargo.missingInfo && cargo.missingInfo.length > 0 && (
                  <div className="mt-3 rounded-md bg-yellow-50 border border-yellow-200 p-3">
                    <p className="text-sm font-medium text-yellow-800">⚠️ Not found or unclear:</p>
                    <ul className="mt-1 list-disc list-inside text-sm text-yellow-700">
                      {cargo.missingInfo.map((item, i) => (
                        <li key={i}>{safeRender(item)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Matching Vessels */}
        {matchingVessels.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">🔗 Matching Vessels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {matchingVessels.map((match, i) => {
                const vessel = session.parsedVessels.find(
                  v => v.emailId === match.vesselEmailId && v.itemIndex === match.vesselItemIndex
                );
                const levelLabel =
                  match.matchLevel === 'good' ? '✅ GOOD MATCH' :
                  match.matchLevel === 'possible' ? '🟡 POSSIBLE' : '⚠️ WEAK';
                const vesselName = vessel ? safeRender(vessel.vesselName) || 'Unknown' : 'Vessel';
                const dwtRaw = vessel ? cfValue(vessel.dwtSummer) : null;
                const dwtStr = dwtRaw != null ? formatNumber(Number(dwtRaw)) : '?';
                return (
                  <Link key={i} href={`/match/${session.matches.indexOf(match)}`}>
                    <div className="p-3 rounded-lg border hover:bg-muted transition-colors cursor-pointer">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium">{vesselName}</p>
                          <p className="text-xs text-muted-foreground">
                            {vessel ? `${dwtStr} DWT` : ''}{match.matchReasons[0] ? ` · ${match.matchReasons[0]}` : ''}
                          </p>
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

        {/* Draft quote */}
        <DraftQuoteCard emailId={id} />
      </div>
    </main>
  );
}
