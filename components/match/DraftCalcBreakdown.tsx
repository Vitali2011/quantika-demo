'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { HardFilterCheck } from '@/lib/types';

interface Props {
  loadPort: string | null;
  dischargePort: string | null;
  /** Load port draft check (hf.draft) — always present. */
  draftCheck: HardFilterCheck;
  /** Discharge port draft check (hf.destDraft) — absent in pre-M4 stored data. */
  destDraftCheck?: HardFilterCheck;
  /** Vessel DWT — used for intermediate formula display only, not gate logic. */
  dwtSummer?: number | null;
  /** Cargo weight (effective max) — used for intermediate formula display only. */
  weightMt?: number | null;
  /** Vessel stated max draft — shown in static-check fallback. */
  statedMaxDraftM?: number | null;
}

interface PortRowProps {
  portLabel: string;
  roleLabel: string;
  check: HardFilterCheck;
  statedMaxDraftM: number | null | undefined;
  hasEstimate: boolean;
}

function PortRow({ portLabel, roleLabel, check, statedMaxDraftM, hasEstimate }: PortRowProps) {
  if (!hasEstimate) {
    const draftRef = statedMaxDraftM != null ? `${statedMaxDraftM} m` : '—';
    const icon = check.pass ? '✓' : '✗';
    const verdict = check.pass ? 'clears' : 'exceeds';
    return (
      <div className={`text-xs ${check.pass ? 'text-emerald-600' : 'text-red-500'}`}>
        {roleLabel} {portLabel}: static check vs stated max draft {draftRef} → {icon} {verdict}
      </div>
    );
  }

  if (check.portLimitM == null) {
    return (
      <div className="text-xs text-ds-text-muted">
        {roleLabel} {portLabel}: limit unknown → pass (no data)
      </div>
    );
  }

  const icon = check.pass ? '✓' : '✗';
  const verdict = check.pass ? 'clears' : 'exceeds';
  return (
    <div className={`text-xs ${check.pass ? 'text-emerald-600' : 'text-red-500'}`}>
      {roleLabel} {portLabel}: limit {check.portLimitM.toFixed(1)} m → {icon} {verdict}
    </div>
  );
}

export function DraftCalcBreakdown({
  loadPort,
  dischargePort,
  draftCheck,
  destDraftCheck,
  dwtSummer,
  weightMt,
  statedMaxDraftM,
}: Props) {
  const [open, setOpen] = useState(false);

  const est = draftCheck.estimatedLadenDraftM;
  const hasEstimate = est != null;

  // Intermediate display steps — mirrors lib/sailing/laden-draft.ts empirical formula.
  // Display only; gate verdict comes from persisted HardFilterCheck, not recomputed here.
  let fullLoadDraftM: number | null = null;
  let rawDraftM: number | null = null;
  if (hasEstimate && dwtSummer != null && weightMt != null && dwtSummer > 0 && weightMt > 0) {
    fullLoadDraftM = 0.4991 * Math.pow(dwtSummer, 0.2991);
    const ratio = Math.min(weightMt / dwtSummer, 1);
    rawDraftM = fullLoadDraftM * Math.pow(ratio, 0.3);
  }

  const bothPass = draftCheck.pass && (destDraftCheck == null || destDraftCheck.pass);

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors"
        aria-expanded={open}
        data-testid="draft-calc-toggle"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Draft calculation
      </button>

      {open && (
        <div className="mt-1.5 pl-3 border-l-2 border-ds-border space-y-1.5" data-testid="draft-calc-body">
          {/* Formula header — 3 lines */}
          {hasEstimate && fullLoadDraftM != null && rawDraftM != null ? (
            <div className="text-xs text-ds-text-muted space-y-0.5">
              <div>
                Full-load: 0.4991 × {Math.round(dwtSummer!).toLocaleString('en-US')}^0.2991
                {' '}= {fullLoadDraftM.toFixed(2)} m
              </div>
              <div>
                Cargo-adjust: × ({Math.round(weightMt!).toLocaleString('en-US')}&thinsp;/&thinsp;{Math.round(dwtSummer!).toLocaleString('en-US')})^0.3
                {' '}= {rawDraftM.toFixed(2)} m
              </div>
              <div className="text-ds-text">
                → {est!.toFixed(1)} m (approximate, conservative)
              </div>
            </div>
          ) : (
            <div className="text-xs text-ds-text-muted">
              cargo weight / DWT unknown → static check vs stated max draft{' '}
              {statedMaxDraftM != null ? `${statedMaxDraftM} m` : '—'}
            </div>
          )}

          {/* Port comparison rows */}
          <div className="space-y-0.5">
            <PortRow
              portLabel={loadPort ?? '(unknown)'}
              roleLabel="Load port"
              check={draftCheck}
              statedMaxDraftM={statedMaxDraftM}
              hasEstimate={hasEstimate}
            />
            {destDraftCheck != null ? (
              <PortRow
                portLabel={dischargePort ?? '(unknown)'}
                roleLabel="Discharge port"
                check={destDraftCheck}
                statedMaxDraftM={statedMaxDraftM}
                hasEstimate={hasEstimate}
              />
            ) : (
              <div className="text-xs text-ds-text-muted">
                Discharge port {dischargePort ?? '(unknown)'}: check data unavailable
              </div>
            )}
          </div>

          {/* Worst-of-two verdict */}
          <div className={`text-xs font-medium ${bothPass ? 'text-emerald-600' : 'text-red-500'}`}>
            {bothPass ? '✓ Clears both ports' : '✗ Fails one or more ports (worst-of-two)'}
          </div>
        </div>
      )}
    </div>
  );
}
