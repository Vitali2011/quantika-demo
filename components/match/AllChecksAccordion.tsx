'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MatchHardFilters, HardFilterCheck } from '@/lib/types';

const GATE_LABELS: Array<{ key: keyof MatchHardFilters; label: string }> = [
  { key: 'draft', label: 'Draft (load port)' },
  { key: 'destDraft', label: 'Draft (discharge port)' },
  { key: 'crane', label: 'Cranes (load)' },
  { key: 'destCrane', label: 'Cranes (discharge)' },
  { key: 'volume', label: 'Volume / hold fit' },
  { key: 'cargoWeight', label: 'Cargo weight vs capacity' },
  { key: 'cargoVessel', label: 'Cargo ↔ vessel type' },
  { key: 'imsbc', label: 'IMSBC compatibility' },
  { key: 'vesselAge', label: 'Vessel age cap' },
  { key: 'dimensions', label: 'Beam / LOA limits' },
  { key: 'gearRequired', label: 'Gear required' },
  { key: 'voyage', label: 'Voyage restrictions' },
  { key: 'flagClass', label: 'Flag / class requirements' },
  { key: 'warPositionVoyage', label: 'War-zone position / voyage' },
];

function verdict(check: HardFilterCheck): { icon: string; cls: string; label: string } {
  if (check.warning) return { icon: '⚠️', cls: 'text-amber-600', label: 'Warn' };
  if (check.pass) return { icon: '✓', cls: 'text-emerald-600', label: 'Pass' };
  return { icon: '✗', cls: 'text-red-500', label: 'Fail' };
}

export function AllChecksAccordion({ hardFilters }: { hardFilters: MatchHardFilters }) {
  const [open, setOpen] = useState(false);
  const rows = GATE_LABELS
    .map((g) => ({ ...g, check: hardFilters[g.key] }))
    .filter((r): r is typeof r & { check: HardFilterCheck } => r.check != null);
  const failCount = rows.filter((r) => !r.check.pass && !r.check.warning).length;
  const warnCount = rows.filter((r) => r.check.warning).length;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors"
        aria-expanded={open}
        data-testid="all-checks-toggle"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        All checks ({rows.length}) · {failCount > 0 ? `${failCount} fail` : 'all pass'}{warnCount > 0 ? ` · ${warnCount} warn` : ''}
      </button>
      {open && (
        <ul className="mt-1.5 pl-3 border-l-2 border-ds-border space-y-1" data-testid="all-checks-body">
          {rows.map(({ key, label, check }) => {
            const v = verdict(check);
            return (
              <li key={String(key)} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-ds-text">{label}</span>
                <span className={`shrink-0 ${v.cls}`}>
                  {v.icon} {check.reason ?? v.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
