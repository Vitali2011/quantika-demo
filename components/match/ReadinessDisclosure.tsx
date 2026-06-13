'use client';

import { LogicDisclosure } from './LogicDisclosure';
import type { WorksheetReadiness } from '@/lib/types';

function verdictColor(v: string): string {
  if (v === 'ideal') return 'text-emerald-600';
  if (v === 'tight' || v === 'idle') return 'text-amber-600';
  if (v === 'late') return 'text-red-500';
  return 'text-slate-400';
}

const VERDICT_LABEL: Record<string, string> = {
  ideal: 'Ideal timing', tight: 'Tight laycan', idle: 'Vessel idle pre-laycan',
  late: 'Late arrival', unknown: 'Unknown',
};

export function ReadinessDisclosure({ readiness: r }: { readiness: WorksheetReadiness }) {
  const label = (
    <span>
      Timing detail
      {r.verdict !== 'unknown' && r.gapDays != null && (
        <span className="ml-1 text-ds-text-muted">({r.gapDays}d gap)</span>
      )}
    </span>
  );

  return (
    <LogicDisclosure label={label} testId="readiness-detail">
      {r.verdict === 'unknown' ? (
        <p className="text-xs text-ds-text-muted py-1">No timing data — distance / routing not available.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs py-1">
          <dt className="text-ds-text-muted">Verdict</dt>
          <dd className={`font-medium ${verdictColor(r.verdict)}`}>{VERDICT_LABEL[r.verdict] ?? r.verdict}</dd>
          {r.gapDays != null && (
            <>
              <dt className="text-ds-text-muted">Gap</dt>
              <dd className="text-ds-text">{r.gapDays}d between arrival and laycan open</dd>
            </>
          )}
          {r.arrivalDate && (
            <>
              <dt className="text-ds-text-muted">ETA</dt>
              <dd className="text-ds-text font-mono">{r.arrivalDate}</dd>
            </>
          )}
          {(r.laycanStart || r.laycanEnd) && (
            <>
              <dt className="text-ds-text-muted">Laycan</dt>
              <dd className="text-ds-text font-mono">
                {r.laycanStart ?? '—'}{r.laycanEnd ? ` – ${r.laycanEnd}` : ''}
              </dd>
            </>
          )}
          {r.distanceNm != null && (
            <>
              <dt className="text-ds-text-muted">Distance</dt>
              <dd className="text-ds-text">{Math.round(r.distanceNm).toLocaleString('en-US')} nm</dd>
            </>
          )}
          {r.sailingDays != null && (
            <>
              <dt className="text-ds-text-muted">Sailing</dt>
              <dd className="text-ds-text">
                ≈{r.sailingDays.toFixed(1)} days
                {r.speedKn != null && <span className="text-ds-text-muted ml-1">@ {r.speedKn} kn</span>}
              </dd>
            </>
          )}
        </dl>
      )}
    </LogicDisclosure>
  );
}
