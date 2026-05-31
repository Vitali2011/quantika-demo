'use client';

import { useState } from 'react';
import { X, FileText, XCircle, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { csrfFetch } from '@/lib/csrf-client';
import { CounterModal } from './CounterModal';

export interface MatchDetailPanelProps {
  matchDbId: number;
  score: number;
  status: string;
  loadPort: string | null;
  dischargePort: string | null;
  cargoType: string | null;
  vesselDwt: number | null;
  laycanDisplay: string | null;
  cargoEmailId?: string;
  hasSessionMatch: boolean;
  fitPercent?: number | null;
  fitBreakdown?: string | null;
}

function PanelContent({
  matchDbId,
  score,
  status,
  loadPort,
  dischargePort,
  cargoType,
  vesselDwt,
  laycanDisplay,
  cargoEmailId,
  hasSessionMatch,
  fitPercent,
  fitBreakdown,
}: MatchDetailPanelProps) {
  const [declining, setDeclining] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  async function handleDecline() {
    if (!confirm('Mark this match as dismissed?')) return;
    setDeclining(true);
    setDeclineError(null);
    try {
      const res = await csrfFetch(`/api/matches/${matchDbId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      window.location.href = '/matches';
    } catch (err) {
      setDeclineError(err instanceof Error ? err.message : 'Failed to decline');
      setDeclining(false);
    }
  }

  const keyFacts = [
    loadPort && { label: 'Load Port', value: loadPort },
    dischargePort && { label: 'Discharge Port', value: dischargePort },
    cargoType && { label: 'Cargo', value: cargoType },
    vesselDwt && { label: 'Vessel DWT', value: `${vesselDwt.toLocaleString('en-US')} MT` },
    laycanDisplay && { label: 'Laycan', value: laycanDisplay },
    { label: 'Status', value: status },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="space-y-3" data-testid="match-detail-panel">
      {/* AI Summary */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wide text-ds-text-muted">
            AI Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-ds-text-muted leading-relaxed">
            {hasSessionMatch
              ? `Score ${score} reflects cargo/vessel compatibility — DWT, route alignment, and laycan window.`
              : 'Session enrichment unavailable. Reload to refresh match data.'}
          </p>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wide text-ds-text-muted">
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cargoEmailId ? (
            <Button
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={() => {
                const tabBtn = document.querySelector('[role="tab"][aria-controls*="quote"]') as HTMLButtonElement | null;
                tabBtn?.click();
                tabBtn?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              Generate Quote
            </Button>
          ) : (
            <p className="text-xs text-ds-text-subtle">Quote requires session data</p>
          )}
          <CounterModal matchDbId={matchDbId} />
          <Button
            size="sm"
            variant="destructive"
            className="w-full justify-start gap-2 text-xs"
            onClick={handleDecline}
            disabled={declining || status === 'dismissed'}
          >
            <XCircle className="h-3.5 w-3.5" />
            {declining ? 'Declining…' : status === 'dismissed' ? 'Declined' : 'Decline'}
          </Button>
          {declineError && (
            <p className="text-xs text-red-600">{declineError}</p>
          )}
        </CardContent>
      </Card>

      {/* Key Facts */}
      {keyFacts.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-ds-text-muted">
              Key Facts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5">
              {keyFacts.map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2 text-xs">
                  <dt className="text-ds-text-muted shrink-0">{label}</dt>
                  <dd className="font-medium text-ds-text text-right truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Fit Breakdown */}
      {fitPercent != null && (() => {
        const fbData = fitBreakdown ? (() => { try { return JSON.parse(fitBreakdown); } catch { return null; } })() : null;
        const components: Array<{ label: string; weight: number; score: number; rationale: string }> =
          fbData?.components ?? [];
        const fitPct = Math.round(fitPercent);
        const fitColor = fitPct >= 85 ? 'text-emerald-600' : fitPct >= 60 ? 'text-amber-600' : 'text-slate-500';
        return (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-wide text-ds-text-muted flex items-center justify-between">
                <span>Fit Score</span>
                <span className={`font-mono text-sm font-semibold ${fitColor}`}>{fitPct}%</span>
              </CardTitle>
            </CardHeader>
            {components.length > 0 && (
              <CardContent>
                <div className="space-y-2">
                  {components.map((c, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-ds-text">{c.label}</span>
                        <span className={`font-mono ${Math.round(c.score / c.weight * 100) >= 60 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {Math.round(c.score / c.weight * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-ds-surface-muted rounded-full h-1">
                        <div
                          className={`h-1 rounded-full ${Math.round(c.score / c.weight * 100) >= 60 ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          style={{ width: `${Math.round(c.score / c.weight * 100)}%` }}
                        />
                      </div>
                      {c.rationale && (
                        <p className="text-[11px] text-ds-text-muted leading-relaxed">{c.rationale}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })()}
    </div>
  );
}

/** Desktop sidebar variant — parent places this inside aside.hidden.lg:block */
export function MatchDetailPanel(props: MatchDetailPanelProps) {
  return <PanelContent {...props} />;
}

/** Mobile bottom-sheet: renders a FAB that opens a slide-up panel */
export function MatchDetailMobileSheet(props: MatchDetailPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-ds-accent shadow-lg ring-1 ring-ds-border-strong"
        aria-label="Open match panel"
        data-testid="mobile-panel-fab"
      >
        <ChevronUp className="h-5 w-5 text-ds-accent-fg" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" data-testid="mobile-panel-sheet">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-ds-surface rounded-t-2xl max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ds-border sticky top-0 bg-ds-surface rounded-t-2xl z-10">
              <span className="text-sm font-semibold text-ds-text">Match Panel</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close panel"
                className="p-1 rounded hover:bg-ds-surface-muted transition-colors"
              >
                <X className="h-4 w-4 text-ds-text-muted" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <PanelContent {...props} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
