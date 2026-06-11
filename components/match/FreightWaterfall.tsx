'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const TIERS: Array<{ id: string; label: string; note: string }> = [
  { id: 'manual',    label: 'Tier 0 · Broker override',        note: 'Manually entered rate (highest trust).' },
  { id: 'parsed',    label: 'Tier 1 · Parsed from cargo email', note: 'Rate stated in the cargo order.' },
  { id: 'baltic',    label: 'Tier 2 · Baltic TC day-rate',      note: '($/day × voyage days) ÷ tonnes.' },
  { id: 'estimated', label: 'Tier 3 · Model estimate',          note: 'Base rate × distance × DWT factors.' },
];

export function FreightWaterfall({ source, rateUsdPerMt }: { source: string | null; rateUsdPerMt: number | null }) {
  const [open, setOpen] = useState(false);
  const winnerId = source ?? null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors"
        aria-expanded={open}
        data-testid="freight-waterfall-toggle"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Freight source waterfall
      </button>
      {open && (
        <ul className="mt-1.5 pl-3 border-l-2 border-ds-border space-y-1" data-testid="freight-waterfall-body">
          {TIERS.map((t) => {
            const isWinner = t.id === winnerId;
            return (
              <li
                key={t.id}
                data-testid={`freight-tier-${t.id}`}
                data-winner={String(isWinner)}
                className={`text-xs ${isWinner ? 'text-ds-text font-medium' : 'text-ds-text-subtle'}`}
              >
                {isWinner ? '→ ' : '  '}{t.label}
                {isWinner && rateUsdPerMt != null && (
                  <span className="ml-1 font-mono">${rateUsdPerMt.toFixed(2)}/mt</span>
                )}
                <span className="block pl-3 text-ds-text-muted">{t.note}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
