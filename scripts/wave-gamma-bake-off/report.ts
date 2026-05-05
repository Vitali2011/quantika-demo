/**
 * Markdown report writer for Wave γ parsing bake-off — Task 7.
 *
 * Renders the per-endpoint winners table, the full aggregation matrix
 * (sorted by endpoint asc, then cost asc), production rollout env-vars,
 * and a notes section. The provider field for env-vars is hard-coded to
 * `gemini` since the bake-off only evaluates Vertex AI Gemini variants;
 * `lib/ai-provider.ts` consumes that string verbatim.
 *
 * Returns the absolute path of the file written.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

import type { AggregateRow } from './aggregate';
import type { DecisionPerEndpoint } from './decide';
import type { Endpoint } from './corpus';

export interface WriteReportInput {
  runId: string;
  outDir: string;
  agg: AggregateRow[];
  decisions: Record<string, DecisionPerEndpoint>;
}

const ENDPOINT_TO_ENV_PREFIX: Record<Endpoint, string> = {
  'parse-cargo': 'PARSE_CARGO',
  'parse-vessel': 'PARSE_VESSEL',
  'parse-recap': 'PARSE_RECAP',
  classify: 'CLASSIFY',
};

function pct(x: number): string {
  return (x * 100).toFixed(1);
}

function dollars(x: number): string {
  return `$${x.toFixed(4)}`;
}

function ms(x: number): string {
  return `${Math.round(x)}ms`;
}

export function writeReport(input: WriteReportInput): string {
  const { runId, outDir, agg, decisions } = input;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const decisionList = Object.values(decisions);
  const anyModeB = decisionList.some((d) => d.flags.includes('mode-b'));
  const anyModeA = decisionList.some((d) => !d.flags.includes('mode-b'));
  const modeUsed = anyModeA && anyModeB ? 'A+B (mixed)' : anyModeA ? 'A' : 'B';

  const lines: string[] = [];
  lines.push(`# Wave γ Parsing Bake-off Report`);
  lines.push(`**Run ID:** ${runId}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');

  // Per-endpoint winners
  lines.push(`## Per-endpoint winners`);
  lines.push(
    `| Endpoint | Winner | Cost/1k | Parity+Better | Flags | Rationale |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  const sortedDecisions = decisionList
    .slice()
    .sort((a, b) => a.endpoint.localeCompare(b.endpoint));
  for (const d of sortedDecisions) {
    let cost = '—';
    let qual = '—';
    if (d.winner !== 'DEFERRED') {
      const winRow = agg.find(
        (r) => r.endpoint === d.endpoint && r.model === d.winner,
      );
      if (winRow) {
        cost = dollars(winRow.costPer1kCalls);
        qual = `${pct(winRow.parityRate + winRow.betterRate)}%`;
      }
    }
    const flagStr = d.flags.length > 0 ? d.flags.join(', ') : '—';
    lines.push(
      `| ${d.endpoint} | ${d.winner} | ${cost} | ${qual} | ${flagStr} | ${d.rationale.replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');

  // Full aggregation matrix
  lines.push(`## Full aggregation matrix`);
  lines.push(
    `| Endpoint | Model | Cases | Pass% | Parity% | Better% | Degraded% | Marginal% | Fail% | ModelErr% | ParseErr% | JudgeErr% | Crit | Cost/1k | Lat p50 | Lat p95 |`,
  );
  lines.push(
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  );
  const sortedAgg = agg.slice().sort((a, b) => {
    if (a.endpoint !== b.endpoint) return a.endpoint.localeCompare(b.endpoint);
    return a.costPer1kCalls - b.costPer1kCalls;
  });
  for (const r of sortedAgg) {
    lines.push(
      `| ${r.endpoint} | ${r.model} | ${r.cases} | ${pct(r.passRate)} | ${pct(r.parityRate)} | ${pct(r.betterRate)} | ${pct(r.degradedRate)} | ${pct(r.marginalRate)} | ${pct(r.failRate)} | ${pct(r.modelErrorRate)} | ${pct(r.parseErrorRate)} | ${pct(r.judgeErrorRate)} | ${r.criticalIssues} | ${dollars(r.costPer1kCalls)} | ${ms(r.avgLatencyMs)} | ${ms(r.p95LatencyMs)} |`,
    );
  }
  lines.push('');

  // Production rollout
  lines.push(`## Production rollout recommendations`);
  lines.push('');
  lines.push('```bash');
  for (const d of sortedDecisions) {
    const prefix = ENDPOINT_TO_ENV_PREFIX[d.endpoint as Endpoint] ?? d.endpoint.toUpperCase().replace(/-/g, '_');
    if (d.winner === 'DEFERRED') {
      lines.push(`# ${d.endpoint}: DEFERRED — ${d.rationale}`);
      lines.push(`# ${prefix}_PROVIDER=gemini`);
      lines.push(`# ${prefix}_MODEL=<no-winner>`);
    } else {
      lines.push(`# ${d.endpoint}: ${d.winner}`);
      lines.push(`${prefix}_PROVIDER=gemini`);
      lines.push(`${prefix}_MODEL=${d.winner}`);
    }
  }
  lines.push('```');
  lines.push('');

  // Notes
  lines.push(`## Notes`);
  lines.push(`- Mode used: ${modeUsed}`);
  const gatePct = anyModeB && !anyModeA ? '80%' : anyModeA && !anyModeB ? '85%' : '85% (Mode A) / 80% (Mode B)';
  lines.push(`- Gate applied: ${gatePct}`);
  for (const d of sortedDecisions) {
    const dq = d.disqualified.length > 0 ? d.disqualified.join(', ') : 'none';
    lines.push(`- Disqualified for ${d.endpoint}: ${dq}`);
  }

  const reportPath = path.join(outDir, `report-${runId}.md`);
  writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');
  return reportPath;
}
