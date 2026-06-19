/**
 * Due Diligence panel — SERVER component (NO 'use client').
 *
 * Dumb renderer of a pre-built DDModel (the page builds the model server-side via
 * buildDueDiligence). Static MVP — no interactivity — which keeps the heavy vetting
 * / l5c / port derivation out of any client bundle. Re-presents existing stored
 * match data as 5 grouped due-diligence categories with a hero check counter.
 */

import {
  Ship, Package, Coins, ShieldCheck, Scale, Info,
  type LucideIcon,
} from 'lucide-react';
import type { DDModel } from '@/lib/matching/due-diligence';
import { DDCheckRow } from './DDCheckRow';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ship: Ship,
  package: Package,
  coin: Coins,
  'shield-check': ShieldCheck,
  scale: Scale,
};

export function DueDiligencePanel({ model }: { model: DDModel }) {
  const { counter, fitPercent } = model;
  const criticalText = counter.flagsCritical === 0 ? 'нет' : String(counter.flagsCritical);

  return (
    <section
      className="bg-ds-surface rounded-xl ring-1 ring-ds-border p-4 sm:p-5 w-full space-y-4"
      data-testid="due-diligence-panel"
      aria-label="Due Diligence"
    >
      {/* Hero row — check counter + fit% */}
      <div className="flex items-start justify-between gap-4 border-b border-ds-border pb-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
            Due Diligence
          </h2>
          <p className="text-sm text-ds-text mt-1">
            Прогнали <span className="font-semibold">{counter.ran}</span> проверок
            <span className="text-ds-text-muted">
              {' · '}{counter.pass} ✓ · {counter.caution} ⚠{counter.info > 0 && <> · <Info className="inline h-3.5 w-3.5 align-text-bottom text-sky-600" aria-hidden /> {counter.info}</>} · критичных стопов {criticalText}
            </span>
          </p>
        </div>
        {fitPercent != null && (
          <div className="shrink-0 font-mono text-lg font-semibold text-ds-accent-soft-fg">
            {Math.round(fitPercent)}%
          </div>
        )}
      </div>

      {/* Category groups */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {model.categories.map((cat) => {
          const CatIcon = CATEGORY_ICONS[cat.icon] ?? Info;
          return (
            <div key={cat.key} data-testid={`dd-category-${cat.key}`}>
              <div className="flex items-center gap-2 mb-1">
                <CatIcon className="h-4 w-4 text-ds-text-muted" aria-hidden />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
                  {cat.label}
                </h3>
              </div>
              <div className="divide-y divide-ds-border/40">
                {cat.checks.map((chk, i) => (
                  <DDCheckRow
                    key={`${cat.key}-${i}`}
                    label={chk.label}
                    state={chk.state}
                    evidence={chk.evidence}
                    detail={chk.detail}
                    source={chk.source}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
