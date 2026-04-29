import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { Renderable } from '@/lib/types';
import { CopyButton } from '@/components/copy-button';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { safeRender, getConf, ConfIcon } from '@/lib/ui-render';
import { formatDate } from '@/lib/utils';

function CField({ label, field }: { label: string; field: Renderable }) {
  const val = safeRender(field);
  const conf = getConf(field);
  if (!val) return null;
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">
        {val} {conf && <ConfIcon confidence={conf} />}
      </span>
    </div>
  );
}

interface Props { params: Promise<{ id: string }>; }

export default async function FixtureDetailPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');
  const email = session.emails.find(e => e.id === id);
  if (!email) notFound();
  const recap = session.parsedFixtureRecaps.find(r => r.emailId === id);

  // Build text recap for copy
  const recapText = recap ? [
    'FIXTURE RECAP',
    `Vessel: ${safeRender(recap.vesselName) || '?'}`,
    `Owners: ${safeRender(recap.owners) || '?'}`,
    `Charterers: ${safeRender(recap.charterers) || '?'}`,
    recap.account ? `Account: ${safeRender(recap.account)}` : '',
    `Load Port: ${safeRender(recap.loadPort) || '?'}`,
    `Disch Port: ${safeRender(recap.dischPort) || '?'}`,
    `Cargo: ${safeRender(recap.cargoDescription) || '?'}`,
    (recap.cargoQuantityMin != null && safeRender(recap.cargoQuantityMin) !== 'NaN' && safeRender(recap.cargoQuantityMin) !== '0') ? `Quantity: ${safeRender(recap.cargoQuantityMin)}${recap.cargoQuantityMax && safeRender(recap.cargoQuantityMax) !== 'NaN' ? `/${safeRender(recap.cargoQuantityMax)}` : ''} MT` : '',
    recap.freightRate ? `Freight: ${safeRender(recap.freightRate)} ${safeRender(recap.freightBasis) || ''}` : '',
    recap.loadingRate ? `Loading: ${safeRender(recap.loadingRate)} ${safeRender(recap.loadingTerms) || ''}` : '',
    recap.dischargingRate ? `Discharging: ${safeRender(recap.dischargingRate)} ${safeRender(recap.dischargingTerms) || ''}` : '',
    recap.demurrageRate ? `Demurrage: ${safeRender(recap.demurrageRate)} ${safeRender(recap.demurragePayment) || ''}` : '',
    recap.commission ? `Commission: ${safeRender(recap.commission)}` : '',
    recap.commissionAmount ? `Calculated: ${safeRender(recap.commissionCurrency) || '$'}${recap.commissionAmount?.toLocaleString()}` : '',
  ].filter(Boolean).join('\n') : '';

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'fixture' }} />
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <div>
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">FIXTURE RECAP</Badge>
          <h1 className="text-lg sm:text-xl font-bold mt-2">{email.subject}</h1>
          <p className="text-sm text-muted-foreground">From: {email.from} · {formatDate(email.date)}</p>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Original Email</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans overflow-x-auto">{email.body || email.snippet}</pre>
          </CardContent>
        </Card>

        {!recap && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500 mb-4">No fixture recap data available for this email.</p>
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
              <ChevronLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
          </div>
        )}

        {recap && (
          <>
            {/* Parties */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Parties</CardTitle></CardHeader>
              <CardContent>
                <CField label="Vessel" field={recap.vesselName} />
                <CField label="Owners" field={recap.owners} />
                <CField label="Charterers" field={recap.charterers} />
                <CField label="Account" field={recap.account} />
                <CField label="Broker" field={recap.broker} />
              </CardContent>
            </Card>

            {/* Route & Cargo */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Route &amp; Cargo</CardTitle></CardHeader>
              <CardContent>
                <CField label="Load Port" field={recap.loadPort} />
                <CField label="Disch Port" field={recap.dischPort} />
                <CField label="Cargo" field={recap.cargoDescription} />
                {(recap.cargoQuantityMin != null && safeRender(recap.cargoQuantityMin) !== 'NaN' && safeRender(recap.cargoQuantityMin) !== '0') && (
                  <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                    <span className="text-muted-foreground">Quantity</span>
                    <span className="font-medium">
                      {safeRender(recap.cargoQuantityMin)}{recap.cargoQuantityMax && safeRender(recap.cargoQuantityMax) !== 'NaN' ? `/${safeRender(recap.cargoQuantityMax)}` : ''} MT
                    </span>
                  </div>
                )}
                <CField label="Packaging" field={recap.cargoPackaging} />
                <CField label="Laycan" field={recap.laycan} />
              </CardContent>
            </Card>

            {/* Rates */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Freight &amp; Rates</CardTitle></CardHeader>
              <CardContent>
                <CField label="Freight Rate" field={recap.freightRate} />
                <CField label="Basis" field={recap.freightBasis} />
                <CField label="Payment" field={recap.freightPayment} />
              </CardContent>
            </Card>

            {/* Laytime — SPLIT */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Laytime</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">Loading</h4>
                  <CField label="Rate" field={recap.loadingRate} />
                  <CField label="Terms" field={recap.loadingTerms} />
                  <CField label="Working Hours" field={recap.loadingWorkingHours} />
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">Discharging</h4>
                  <CField label="Rate" field={recap.dischargingRate} />
                  <CField label="Terms" field={recap.dischargingTerms} />
                  <CField label="Working Hours" field={recap.dischargingWorkingHours} />
                </div>
              </CardContent>
            </Card>

            {/* Demurrage */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Demurrage</CardTitle></CardHeader>
              <CardContent>
                <CField label="Rate" field={recap.demurrageRate} />
                <CField label="Payment" field={recap.demurragePayment} />
              </CardContent>
            </Card>

            {/* Commission */}
            {recap.commission && (
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">💰 Commission</CardTitle></CardHeader>
                <CardContent>
                  <CField label="Commission" field={recap.commission} />
                  {recap.commissionPercent != null && recap.commissionAmount != null && (
                    <div className="mt-2 p-2 bg-green-100 rounded text-sm">
                      <strong>Calculated: {safeRender(recap.commissionCurrency) || '$'}{recap.commissionAmount.toLocaleString()}</strong>
                      <span className="text-muted-foreground ml-2">({recap.commissionPercent}% on freight)</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Legal */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Legal &amp; Terms</CardTitle></CardHeader>
              <CardContent>
                <CField label="CP Form" field={recap.cpForm} />
                <CField label="Arbitration" field={recap.arbitration} />
                <CField label="Law" field={recap.law} />
                {recap.subs.length > 0 && (
                  <div className="mt-2">
                    <span className="text-sm text-muted-foreground">Subs:</span>
                    <ul className="list-disc list-inside text-sm mt-1">
                      {recap.subs.map((s, i) => <li key={i}>{safeRender(s)}</li>)}
                    </ul>
                  </div>
                )}
                {recap.additionalTerms.length > 0 && (
                  <div className="mt-2">
                    <span className="text-sm text-muted-foreground">Additional Terms:</span>
                    <ul className="list-disc list-inside text-sm mt-1">
                      {recap.additionalTerms.map((t, i) => <li key={i}>{safeRender(t)}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Unknown terms */}
            {recap.unknownTerms.length > 0 && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-sm font-medium text-yellow-800">❓ Unrecognized Terms</p>
                {recap.unknownTerms.map((ut, i) => (
                  <p key={i} className="text-sm text-yellow-700">{safeRender(ut.term)}: {safeRender(ut.note)}</p>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <CopyButton text={recapText} label="Copy Recap as Text" />
            </div>
          </>
        )}

        {/* Disclaimer */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-gray-100 rounded p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>This recap is AI-generated. Always verify against original emails before using in business communications.</span>
        </div>
      </div>
    </main>
  );
}
