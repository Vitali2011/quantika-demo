'use client';

import { LogicDisclosure } from './LogicDisclosure';
import type { HardFilterCheck } from '@/lib/types';

export function ImsbcDisclosure({ imsbc }: { imsbc?: HardFilterCheck }) {
  if (!imsbc) return null;

  const { pass, warning, reason } = imsbc;
  const verdictText = warning
    ? `⚠️ Caution${reason ? ` — ${reason}` : ''}`
    : pass
      ? '✅ IMSBC compatible'
      : `❌ Not compatible${reason ? ` — ${reason}` : ''}`;
  const verdictCls = warning ? 'text-amber-600' : pass ? 'text-emerald-600' : 'text-red-500';

  return (
    <LogicDisclosure label="IMSBC / hold compatibility" testId="imsbc">
      <p className={`text-xs py-1 ${verdictCls}`}>{verdictText}</p>
    </LogicDisclosure>
  );
}
