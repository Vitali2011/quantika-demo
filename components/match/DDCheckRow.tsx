'use client';

/**
 * Due-Diligence check row — THIN 'use client' leaf (hybrid disclosure).
 *
 * Renders one pre-built DDCheck: state icon + label + evidence (always visible),
 * plus a «Подробнее» chevron that reveals the server-built `detail` (worked-calc /
 * plain-language explanation) and a `source` badge.
 *
 * RSC boundary (recon Q3): this is the ONLY interactive piece. It MUST NOT import
 * anything from lib/matching|sailing|ports|cargo|sanctions or data/ports — that would
 * drag the port-master landmine (+786KB) into the client bundle. Only `DDState` and
 * `DraftDerivation` are imported, type-only (erased at build). Strings + the numeric
 * derivation payload arrive ready as props; formula intermediates are pure arithmetic.
 */

import { useState } from 'react';
import {
  Check, AlertTriangle, Info, Minus,
  ChevronDown, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type { DDState, DraftDerivation } from '@/lib/matching/due-diligence';

const STATE_META: Record<DDState, { Icon: LucideIcon; cls: string; row: string }> = {
  pass: { Icon: Check, cls: 'text-emerald-600', row: 'text-ds-text' },
  caution: { Icon: AlertTriangle, cls: 'text-amber-600', row: 'text-ds-text' },
  info: { Icon: Info, cls: 'text-sky-600', row: 'text-ds-text' },
  inactive: { Icon: Minus, cls: 'text-ds-text-subtle', row: 'text-ds-text-subtle italic' },
};

export interface DDCheckRowProps {
  label: string;
  state: DDState;
  evidence: string | null;
  detail?: string | null;
  source?: string | null;
  /** Draft rows: numeric inputs → full laden-draft formula rendered in «Подробнее». */
  derivation?: DraftDerivation | null;
}

/**
 * Full laden-draft derivation — recomputes the intermediates (full-load draft, ratio)
 * client-side for display; `laden` and `pass` arrive STORED from the server (parity).
 * Mirrors lib/sailing/laden-draft.ts: fullLoad = 0.4991 × DWT^0.2991, raw = fullLoad
 * × ratio^0.3, laden = ceil(raw, 0.1). No heavy imports — pure arithmetic on props.
 */
function DraftDerivationSteps({ d }: { d: DraftDerivation }) {
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  const fullLoad = 0.4991 * Math.pow(d.dwt, 0.2991);
  const ratio = Math.min(d.cargoTons / d.dwt, 1);
  const raw = fullLoad * Math.pow(ratio, 0.3);
  const loadPct = Math.round(ratio * 100);
  const margin = d.portLimit != null ? Math.round((d.portLimit - d.laden) * 10) / 10 : null;

  return (
    <div className="text-xs text-ds-text-muted space-y-0.5" data-testid="dd-draft-derivation">
      <div>
        DWT {fmt(d.dwt)} mt · груз {fmt(d.cargoTons)} mt (верхн. граница) · загрузка {loadPct}%
      </div>
      <div className="font-mono">→ 1) осадка полная: 0.4991 × {fmt(d.dwt)}^0.2991 = {fullLoad.toFixed(2)} m</div>
      <div className="font-mono">→ 2) × ({fmt(d.cargoTons)}&thinsp;/&thinsp;{fmt(d.dwt)})^0.3 = {raw.toFixed(2)} m</div>
      <div className="font-mono text-ds-text">→ 3) округление вверх = {d.laden.toFixed(1)} m</div>
      {margin != null ? (
        <div className={`font-mono ${d.pass ? 'text-emerald-600' : 'text-red-500'}`}>
          → vs лимит причала {d.portLimit!.toFixed(1)} m · запас {margin >= 0 ? '+' : '−'}{Math.abs(margin).toFixed(1)} m {d.pass ? '✓' : '✗'}
        </div>
      ) : (
        <div className="text-ds-text-muted">
          → лимит причала не задан в реестре портов{d.pass ? ' · проходит (нет данных)' : ''}
        </div>
      )}
    </div>
  );
}

export function DDCheckRow({ label, state, evidence, detail, source, derivation }: DDCheckRowProps) {
  const [open, setOpen] = useState(false);
  const meta = STATE_META[state];
  const { Icon } = meta;
  const hasDetail = !!detail;
  const hasDerivation = !!derivation;
  const expandable = hasDetail || hasDerivation;

  return (
    <div className="flex items-start gap-2 py-1.5" data-testid="dd-check-row">
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${meta.cls}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${meta.row}`}>{label}</p>
        {evidence && (
          <p className="text-xs text-ds-text-muted leading-snug mt-0.5 break-words">{evidence}</p>
        )}

        {expandable && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors mt-1"
            aria-expanded={open}
            data-testid="dd-check-toggle"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {open ? 'Свернуть' : 'Подробнее'}
          </button>
        )}

        {expandable && open && (
          <div
            className="mt-1.5 pl-3 border-l-2 border-ds-border space-y-1.5"
            data-testid="dd-check-detail"
          >
            {detail && (
              <p className="text-sm text-ds-text-muted leading-relaxed whitespace-pre-line break-words">
                {detail}
              </p>
            )}
            {derivation && <DraftDerivationSteps d={derivation} />}
            {source && (
              <span className="inline-block text-xs text-ds-text-subtle bg-ds-surface-subtle border border-ds-border/60 px-1.5 py-0.5 rounded">
                Источник: {source}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
