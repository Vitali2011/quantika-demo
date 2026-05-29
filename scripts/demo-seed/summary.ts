// scripts/demo-seed/summary.ts
import type { Manifest } from './manifest-schema';

export interface SummaryInput {
  counts: { cargo: number; vessel: number; recap: number; classify: number };
  matchCount: number;
  anonymization: Manifest['anonymization'];
  conflicts: string[];
}

export function formatSummary(input: SummaryInput): string {
  const { counts, matchCount, anonymization, conflicts } = input;
  const lines: string[] = [];
  lines.push('=== Demo seed summary ===');
  lines.push(`parsed: classify=${counts.classify} cargo=${counts.cargo} vessel=${counts.vessel} recap=${counts.recap}`);
  lines.push(`matches=${matchCount} (shortlist)`);
  const anonCount = Object.values(anonymization).reduce((n, m) => n + Object.keys(m).length, 0);
  lines.push(`anonymization: ${anonCount} aliases`);
  for (const [kind, map] of Object.entries(anonymization)) {
    for (const [real, pseudo] of Object.entries(map).slice(0, 5)) lines.push(`  [${kind}] ${real} → ${pseudo}`);
  }
  lines.push(`conflicts: ${conflicts.length}`);
  for (const c of conflicts) lines.push(`  ! ${c}`);
  return lines.join('\n');
}
