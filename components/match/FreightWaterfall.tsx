'use client';

import { LogicDisclosure } from './LogicDisclosure';

const TIERS: Array<{ id: string; label: string; note: string }> = [
  { id: 'manual',    label: 'Tier 0 · Broker override',        note: 'Manually entered rate (highest trust).' },
  { id: 'parsed',    label: 'Tier 1 · Parsed from cargo email', note: 'Rate stated in the cargo order.' },
  { id: 'baltic',    label: 'Tier 2 · Baltic TC day-rate',      note: '($/day × voyage days) ÷ tonnes.' },
  { id: 'estimated', label: 'Tier 3 · Model estimate',          note: 'Base rate × distance × DWT factors.' },
];

export function FreightWaterfall({ source, rateUsdPerMt }: { source: string | null; rateUsdPerMt: number | null }) {
  const winnerId = source ?? null;
  return (
    <LogicDisclosure label="Freight source waterfall" testId="freight-waterfall">
      <ul className="space-y-1">
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
    </LogicDisclosure>
  );
}
