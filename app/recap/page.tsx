import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card } from '@/design-system/primitives';
import { RecapGenerateCard } from '@/components/recap/RecapGenerateCard';

export const metadata: Metadata = {
  title: 'Negotiation Recap — Quantika',
};

export default async function RecapIndexPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  const session = sessionId ? getSession(sessionId) : null;

  if (!session) {
    return (
      <main className="min-h-screen bg-ds-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold text-ds-text">No negotiations yet</h1>
          <p className="text-sm text-ds-text-muted">Upload emails to start tracking fixture negotiations.</p>
          <Link href="/processing" className="inline-flex items-center gap-2 rounded-ds-md bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-fg hover:bg-ds-accent/90 transition-colors duration-ds-fast">
            Upload emails
          </Link>
        </div>
      </main>
    );
  }

  const { recaps, emails, parsedCargos, parsedVessels } = session;

  return (
    <main className="min-h-screen bg-ds-bg px-4 py-6">
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ds-text">Negotiation Recap</h1>
          <p className="text-sm text-ds-text-muted mt-0.5">
            AI-assisted recap generation from email threads
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Form + AI assist */}
          <div className="lg:col-span-2 space-y-4">
            {/* AI Assist card */}
            <Card padding="md">
              <RecapGenerateCard />
            </Card>

            {/* Missing fields highlight */}
            <Card padding="md">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-ds-text">Fields</h2>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Vessel', value: parsedVessels[0] ? (parsedVessels[0].vesselName?.value ?? '—') : '—', filled: !!parsedVessels[0]?.vesselName },
                    { label: 'Cargo', value: parsedCargos[0] ? (parsedCargos[0].cargoDescription?.value ?? '—') : '—', filled: !!parsedCargos[0]?.cargoDescription },
                    { label: 'Load port', value: parsedCargos[0]?.originPort?.value ?? '—', filled: !!parsedCargos[0]?.originPort },
                    { label: 'Disch port', value: parsedCargos[0]?.destinationPort?.value ?? '—', filled: !!parsedCargos[0]?.destinationPort },
                    { label: 'Laycan', value: parsedCargos[0]?.laycan ?? '—', filled: !!parsedCargos[0]?.laycan },
                    { label: 'Freight', value: parsedCargos[0]?.freightRateUsd ? `$${parsedCargos[0].freightRateUsd}/mt` : '—', filled: parsedCargos.length > 0 },
                  ].map(({ label, value, filled }) => (
                    <div
                      key={label}
                      className={`flex items-start justify-between rounded-ds-sm px-2 py-1.5 border text-xs ${
                        filled
                          ? 'bg-ds-surface border-ds-border'
                          : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <span className="text-ds-text-muted font-medium">{label}</span>
                      <span className={`ml-2 font-medium ${filled ? 'text-ds-text' : 'text-amber-600'}`}>
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Recap list */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ds-text">Active Negotiations ({recaps.length})</h2>
              {recaps.length === 0 ? (
                <Card padding="md">
                  <p className="text-sm text-ds-text-muted text-center py-2">
                    No negotiations yet. Recaps are generated from threads with 5+ messages.
                  </p>
                </Card>
              ) : (
                recaps.map((recap) => {
                  const agreed = recap.points.filter((p) => p.status === 'AGREED').length;
                  const pending = recap.points.filter((p) => p.status === 'PENDING').length;
                  return (
                    <Link key={recap.threadId} href={`/recap/${recap.threadId}`} className="block focus-visible:ring-2 focus-visible:ring-ds-accent/40 rounded-ds-md outline-none">
                      <Card padding="md" interactive>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ds-text truncate">{recap.subject}</p>
                            <p className="text-xs text-ds-text-muted mt-0.5">
                              {recap.emailCount} emails · {recap.dateRange} · {recap.participants.join(' ↔ ')}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            {agreed > 0 && (
                              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-ds-sm px-1.5 py-0.5">
                                {agreed} agreed
                              </span>
                            )}
                            {pending > 0 && (
                              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-ds-sm px-1.5 py-0.5">
                                {pending} pending
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Sources panel */}
          <div className="space-y-4">
            <Card padding="md">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-ds-text">Sources</h2>
                <p className="text-xs text-ds-text-muted">
                  Fields populated from these emails:
                </p>
                <div className="space-y-2">
                  {emails.slice(0, 6).map((email) => {
                    const processed = session.processedEmails.find((p) => p.emailId === email.id);
                    return (
                      <div key={email.id} className="flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 text-xs text-ds-text-muted">📧</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-ds-text truncate">{email.fromName ?? email.from}</p>
                          <p className="text-xs text-ds-text-muted truncate">{email.subject}</p>
                          {processed && (
                            <p className="text-xs text-ds-text-muted/70 mt-0.5">
                              → {processed.type.replace(/_/g, ' ').toLowerCase()}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {emails.length === 0 && (
                    <p className="text-xs text-ds-text-muted">No emails processed yet.</p>
                  )}
                  {emails.length > 6 && (
                    <p className="text-xs text-ds-text-muted">+{emails.length - 6} more</p>
                  )}
                </div>
              </div>
            </Card>

            {/* Summary stats */}
            <Card padding="md">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-ds-text">Summary</h2>
                <dl className="space-y-1.5">
                  {[
                    { label: 'Emails', value: emails.length },
                    { label: 'Cargos parsed', value: parsedCargos.length },
                    { label: 'Vessels parsed', value: parsedVessels.length },
                    { label: 'Active negotiations', value: recaps.length },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <dt className="text-xs text-ds-text-muted">{label}</dt>
                      <dd className="text-xs font-semibold text-ds-text tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
