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

export function VettingBreakdown({ fitBreakdown }: { fitBreakdown: string | null | undefined }) {
  if (!fitBreakdown) return null;
  let vetting: FitComponent | undefined;
  try {
    const fb = JSON.parse(fitBreakdown);
    vetting = (fb.components as FitComponent[] | undefined)?.find((c) => c.factor === 'vetting');
  } catch {
    return null;
  }
  if (!vetting) return null;

  const pct = Math.round((vetting.score / vetting.weight) * 100);
  const pctCls = pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500';

  return (
    <LogicDisclosure
      label={<span>Vetting detail <span className={`font-mono ml-1 ${pctCls}`}>{pct}%</span></span>}
      testId="vetting-detail"
    >
      <div className="text-xs py-1 space-y-1">
        <p className="text-ds-text-muted leading-relaxed">{vetting.rationale}</p>
        {vetting.bracketData && (
          <p className="text-ds-text-subtle font-mono">[{vetting.bracketData}]</p>
        )}
      </div>
    </LogicDisclosure>
  );
}
