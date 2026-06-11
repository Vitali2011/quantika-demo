'use client';

import { LogicDisclosure } from './LogicDisclosure';

interface FitComponent {
  factor: string;
  label: string;
  weight: number;
  score: number;
  rationale: string;
  bracketData?: string;
}

export function UtilisationChartererDisclosure({ fitBreakdown }: { fitBreakdown: string | null | undefined }) {
  if (!fitBreakdown) return null;

  let util: FitComponent | undefined;
  let chartererPenalty = 0;
  try {
    const fb = JSON.parse(fitBreakdown);
    util = (fb.components as FitComponent[] | undefined)?.find((c) => c.factor === 'utilisation');
    chartererPenalty = fb.chartererPenalty ?? 0;
  } catch {
    return null;
  }
  if (!util && chartererPenalty === 0) return null;

  return (
    <LogicDisclosure label="Utilisation & charterer" testId="util-charterer">
      <div className="text-xs py-1 space-y-1.5">
        {util && (
          <div>
            <p className="text-ds-text-muted leading-relaxed">{util.rationale}</p>
            {util.bracketData && (
              <p className="text-ds-text-subtle font-mono mt-0.5">[{util.bracketData}]</p>
            )}
          </div>
        )}
        {chartererPenalty > 0 && (
          <div className="flex justify-between text-xs border-t border-ds-border-subtle pt-1">
            <span className="text-ds-text-muted">Charterer tier penalty</span>
            <span className="font-mono text-amber-600">−{chartererPenalty}</span>
          </div>
        )}
      </div>
    </LogicDisclosure>
  );
}
