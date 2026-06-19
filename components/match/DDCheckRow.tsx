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
 * drag the port-master landmine (+786KB) into the client bundle. Only `DDState` is
 * imported, type-only (erased at build). All strings arrive ready as props.
 */

import { useState } from 'react';
import {
  Check, AlertTriangle, Info, Minus,
  ChevronDown, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type { DDState } from '@/lib/matching/due-diligence';

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
}

export function DDCheckRow({ label, state, evidence, detail, source }: DDCheckRowProps) {
  const [open, setOpen] = useState(false);
  const meta = STATE_META[state];
  const { Icon } = meta;
  const hasDetail = !!detail;

  return (
    <div className="flex items-start gap-2 py-1.5" data-testid="dd-check-row">
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${meta.cls}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${meta.row}`}>{label}</p>
        {evidence && (
          <p className="text-xs text-ds-text-muted leading-snug mt-0.5 break-words">{evidence}</p>
        )}

        {hasDetail && (
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

        {hasDetail && open && (
          <div
            className="mt-1.5 pl-3 border-l-2 border-ds-border space-y-1.5"
            data-testid="dd-check-detail"
          >
            <p className="text-sm text-ds-text-muted leading-relaxed whitespace-pre-line break-words">
              {detail}
            </p>
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
