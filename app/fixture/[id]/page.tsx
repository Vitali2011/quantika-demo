import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card, Badge } from '@/design-system/primitives';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { Renderable } from '@/lib/types';
import { CopyButton } from '@/components/copy-button';
import { AnalyticsTracker } from '@/lib/analytics-tracker';
import { safeRender, getConf, ConfIcon } from '@/lib/ui-render';
import { formatDate, formatNumber } from '@/lib/utils';
import { isDemoMode } from '@/lib/demo-mode';

// Only render ConfIcon for the three canonical string labels. Numeric scores
// (0–1) from the parser are truthy but invalid — rendering them would leave a
// space-only text-node that mismatches during React hydration (#418).
const VALID_CONF = new Set(['confirmed', 'interpreted', 'uncertain']);

function CField({ label, field }: { label: string; field: Renderable }) {
  const val = safeRender(field);
  const conf = getConf(field);
  if (!val) return null;
  const confStr = typeof conf === 'string' && VALID_CONF.has(conf) ? conf : undefined;
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-ds-border">
      <span className="text-ds-text-muted">{label}</span>
      <span className="font-medium text-ds-text text-right max-w-[60%]">
        {val}{confStr ? <> <ConfIcon confidence={confStr} /></> : null}
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
  if (!session) {
    if (isDemoMode()) redirect(`/api/demo/rehydrate?next=/fixture/${id}`);
    redirect('/');
  }
  const email = session.emails.find(e => e.id === id);
  if (!email) notFound();
  const recap = session.parsedFixtureRecaps.find(r => r.emailId === id);

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
    recap.commissionAmount ? `Calculated: ${safeRender(recap.commissionCurrency) || '$'}${formatNumber(recap.commissionAmount)}` : '',
    recap.despatchRate ? `Despatch: ${safeRender(recap.despatchRate)}` : '',
    recap.acknowledgementDeadline ? `Ack Deadline: ${recap.acknowledgementDeadline}` : '',
    recap.vesselDraft ? `Draft: ${recap.vesselDraft}` : '',
  ].filter(Boolean).join('\n') : '';

  return (
    <main className="min-h-screen bg-ds-bg py-4 sm:py-8 px-3 sm:px-4">
      <AnalyticsTracker event="detail_viewed" properties={{ type: 'fixture' }} />
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-ds-text-muted hover:text-ds-text transition-colors duration-ds-fast">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <div>
          <Badge>FIXTURE RECAP</Badge>
          <h1 className="text-lg sm:text-xl font-bold mt-2 text-ds-text">{email.subject}</h1>
          <p className="text-sm text-ds-text-muted">From: {email.fromName ?? email.from} · {formatDate(email.date)}</p>
        </div>

        <Card padding="md">
          <h3 className="text-sm font-medium text-ds-text pb-2">Original Email</h3>
          <pre className="text-sm whitespace-pre-wrap font-sans overflow-x-auto text-ds-text">{email.body || email.snippet}</pre>
        </Card>

        {!recap && (
          <div className="rounded-ds-md border border-ds-border bg-ds-surface p-8 text-center">
            <p className="text-ds-text-muted mb-4">No fixture recap data available for this email.</p>
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-ds-info hover:underline">
              <ChevronLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
          </div>
        )}

        {recap && (
          <>
            {/* Parties */}
            <Card padding="md">
              <h3 className="text-sm font-medium text-ds-text pb-2">Parties</h3>
              <CField label="Vessel" field={recap.vesselName} />
              <CField label="Owners" field={recap.owners} />
              <CField label="Charterers" field={recap.charterers} />
              <CField label="Account" field={recap.account} />
              <CField label="Broker" field={recap.broker} />
            </Card>

            {/* Vessel Specs */}
            {(recap.vesselDwt != null || recap.vesselDraft || recap.vesselGeared != null) && (
              <Card padding="md">
                <h3 className="text-sm font-medium text-ds-text pb-2">Vessel Specs</h3>
                {recap.vesselDwt != null && (
                  <div className="flex justify-between text-sm py-1.5 border-b border-ds-border">
                    <span className="text-ds-text-muted">DWT</span>
                    <span className="font-medium text-ds-text">{formatNumber(recap.vesselDwt)} MT</span>
                  </div>
                )}
                {recap.vesselDraft && (
                  <div className="flex justify-between text-sm py-1.5 border-b border-ds-border">
                    <span className="text-ds-text-muted">Draft</span>
                    <span className="font-medium text-ds-text">{recap.vesselDraft}</span>
                  </div>
                )}
                {recap.vesselGeared != null && (
                  <div className="flex justify-between text-sm py-1.5">
                    <span className="text-ds-text-muted">Geared</span>
                    <span className="font-medium text-ds-text">{recap.vesselGeared ? 'Yes' : 'No (gearless)'}</span>
                  </div>
                )}
              </Card>
            )}

            {/* Route & Cargo */}
            <Card padding="md">
              <h3 className="text-sm font-medium text-ds-text pb-2">Route &amp; Cargo</h3>
              <CField label="Load Port" field={recap.loadPort} />
              <CField label="Disch Port" field={recap.dischPort} />
              <CField label="Cargo" field={recap.cargoDescription} />
              {(recap.cargoQuantityMin != null && safeRender(recap.cargoQuantityMin) !== 'NaN' && safeRender(recap.cargoQuantityMin) !== '0') && (
                <div className="flex justify-between text-sm py-1.5 border-b border-ds-border">
                  <span className="text-ds-text-muted">Quantity</span>
                  <span className="font-medium text-ds-text">
                    {safeRender(recap.cargoQuantityMin)}{recap.cargoQuantityMax && safeRender(recap.cargoQuantityMax) !== 'NaN' ? `/${safeRender(recap.cargoQuantityMax)}` : ''} MT
                  </span>
                </div>
              )}
              <CField label="Packaging" field={recap.cargoPackaging} />
              <CField label="Laycan" field={recap.laycan} />
            </Card>

            {/* Rates */}
            <Card padding="md">
              <h3 className="text-sm font-medium text-ds-text pb-2">Freight &amp; Rates</h3>
              <CField label="Freight Rate" field={recap.freightRate} />
              <CField label="Basis" field={recap.freightBasis} />
              <CField label="Payment" field={recap.freightPayment} />
            </Card>

            {/* Laytime */}
            <Card padding="md">
              <h3 className="text-sm font-medium text-ds-text pb-2">Laytime</h3>
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-medium text-ds-text-muted mb-1">Loading</h4>
                  <CField label="Rate" field={recap.loadingRate} />
                  <CField label="Terms" field={recap.loadingTerms} />
                  <CField label="Working Hours" field={recap.loadingWorkingHours} />
                </div>
                <div>
                  <h4 className="text-xs font-medium text-ds-text-muted mb-1">Discharging</h4>
                  <CField label="Rate" field={recap.dischargingRate} />
                  <CField label="Terms" field={recap.dischargingTerms} />
                  <CField label="Working Hours" field={recap.dischargingWorkingHours} />
                </div>
              </div>
            </Card>

            {/* Demurrage & Despatch */}
            <Card padding="md">
              <h3 className="text-sm font-medium text-ds-text pb-2">Demurrage &amp; Despatch</h3>
              <CField label="Demurrage Rate" field={recap.demurrageRate} />
              <CField label="Payment" field={recap.demurragePayment} />
              <CField label="Despatch Rate" field={recap.despatchRate} />
            </Card>

            {/* Commission */}
            {(recap.commission ||
              recap.commissionAddressPct != null ||
              recap.commissionAddressAmount != null ||
              recap.commissionBrokerPct != null ||
              recap.commissionBrokerAmount != null) && (
              <Card padding="md" className="border-ds-success/30 bg-ds-success-soft/20">
                <h3 className="text-sm font-medium text-ds-text pb-2">💰 Commission</h3>
                <CField label="Commission" field={recap.commission} />
                {recap.commissionPercent != null && recap.commissionAmount != null && (
                  <div className="mt-2 p-2 bg-ds-success-soft rounded-ds-sm text-sm">
                    <strong className="text-ds-success">Calculated: {safeRender(recap.commissionCurrency) || '$'}{formatNumber(recap.commissionAmount)}</strong>
                    <span className="text-ds-text-muted ml-2">({recap.commissionPercent}% on freight)</span>
                  </div>
                )}
                {(recap.commissionAddressPct != null || recap.commissionAddressAmount != null) && (
                  <div className="flex justify-between text-sm py-1.5 border-b border-ds-border">
                    <span className="text-ds-text-muted">Address Commission</span>
                    <span className="font-medium text-ds-text">
                      {recap.commissionAddressPct != null && `${recap.commissionAddressPct}%`}
                      {recap.commissionAddressPct != null && recap.commissionAddressAmount != null && ' · '}
                      {recap.commissionAddressAmount != null && `${safeRender(recap.commissionCurrency) || '$'}${formatNumber(recap.commissionAddressAmount)}`}
                    </span>
                  </div>
                )}
                {(recap.commissionBrokerPct != null || recap.commissionBrokerAmount != null) && (
                  <div className="flex justify-between text-sm py-1.5">
                    <span className="text-ds-text-muted">Broker Commission</span>
                    <span className="font-medium text-ds-text">
                      {recap.commissionBrokerPct != null && `${recap.commissionBrokerPct}%`}
                      {recap.commissionBrokerPct != null && recap.commissionBrokerAmount != null && ' · '}
                      {recap.commissionBrokerAmount != null && `${safeRender(recap.commissionCurrency) || '$'}${formatNumber(recap.commissionBrokerAmount)}`}
                    </span>
                  </div>
                )}
              </Card>
            )}

            {/* Legal */}
            <Card padding="md">
              <h3 className="text-sm font-medium text-ds-text pb-2">Legal &amp; Terms</h3>
              <CField label="CP Form" field={recap.cpForm} />
              <CField label="Arbitration" field={recap.arbitration} />
              <CField label="Law" field={recap.law} />
              {recap.acknowledgementDeadline && (
                <div className="mt-2 p-2 bg-ds-warn-soft border border-ds-warn/20 rounded-ds-sm text-sm">
                  <strong className="text-ds-warn">⏱ Acknowledgement Deadline:</strong>
                  <span className="ml-2 text-ds-text">{recap.acknowledgementDeadline}</span>
                </div>
              )}
              {recap.subs.length > 0 && (
                <div className="mt-2">
                  <span className="text-sm text-ds-text-muted">Subs:</span>
                  <ul className="list-disc list-inside text-sm mt-1 text-ds-text">
                    {recap.subs.map((s, i) => <li key={i}>{safeRender(s)}</li>)}
                  </ul>
                </div>
              )}
              {recap.additionalTerms.length > 0 && (
                <div className="mt-2">
                  <span className="text-sm text-ds-text-muted">Additional Terms:</span>
                  <ul className="list-disc list-inside text-sm mt-1 text-ds-text">
                    {recap.additionalTerms.map((t, i) => <li key={i}>{safeRender(t)}</li>)}
                  </ul>
                </div>
              )}
            </Card>

            {/* Unknown terms */}
            {recap.unknownTerms.length > 0 && (
              <div className="rounded-ds-md bg-ds-warn-soft border border-ds-warn/20 p-3">
                <p className="text-sm font-medium text-ds-warn">❓ Unrecognized Terms</p>
                {recap.unknownTerms.map((ut, i) => (
                  <p key={i} className="text-sm text-ds-text">{safeRender(ut.term)}: {safeRender(ut.note)}</p>
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
        <div className="flex items-start gap-2 text-xs text-ds-text-muted bg-ds-surface-muted rounded-ds-md p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>This recap is AI-generated. Always verify against original emails before using in business communications.</span>
        </div>
      </div>
    </main>
  );
}
