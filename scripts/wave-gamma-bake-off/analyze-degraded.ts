/**
 * Spec 04 — Analyze DEGRADED/FAIL/MARGINAL patterns from bake-off JSONL.
 *
 * Groups judge issues by (endpoint × field × severity), counts frequency,
 * and prints top-N patterns per endpoint with examples.
 *
 * Usage:
 *   npx tsx scripts/wave-gamma-bake-off/analyze-degraded.ts \
 *     --in .specs/wave-gamma-vertex/bake-off-results/run-opus-anchor.jsonl \
 *     [--min-cases 3] [--top 3] [--iter 0]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

import type { BakeOffRecord } from './orchestrator';
import type { Endpoint } from './corpus';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface IssuePattern {
  /** field × severity key, e.g. "urgency|med" */
  key: string;
  field: string;
  severity: string;
  count: number;
  examples: PatternExample[];
}

export interface PatternExample {
  caseId: string;
  model: string;
  what: string;
  referenceValue?: string;
  candidateValue?: string;
}

export interface DiffPattern {
  /** diff:field key, e.g. "diff:confidence|mismatch" */
  key: string;
  field: string;
  count: number;
  examples: DiffExample[];
}

export interface DiffExample {
  caseId: string;
  model: string;
  referenceValue: string;
  candidateValue: string;
  comment: string;
}

export interface EndpointAnalysis {
  endpoint: Endpoint;
  totalRecords: number;
  judgedRecords: number;
  judgeErrorRecords: number;
  degradedCount: number;
  parityCount: number;
  betterCount: number;
  failCount: number;
  marginalCount: number;
  issuePatterns: IssuePattern[];
  diffPatterns: DiffPattern[];
  status: 'ANALYZED' | 'INSUFFICIENT_DATA';
}

export interface AnalysisResult {
  inputFile: string;
  iteration: number;
  minCases: number;
  topN: number;
  endpoints: EndpointAnalysis[];
}

/* ------------------------------------------------------------------ */
/*  Core analysis                                                      */
/* ------------------------------------------------------------------ */

const DEGRADED_VERDICTS = new Set([
  'PASS_DEGRADED',
  'FAIL',
  'PASS_MARGINAL',
]);

export function parseJsonl(content: string): BakeOffRecord[] {
  return content
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as BakeOffRecord);
}

export function analyzeEndpoint(
  records: BakeOffRecord[],
  endpoint: Endpoint,
  minCases: number,
  topN: number,
): EndpointAnalysis {
  const epRecords = records.filter((r) => r.endpoint === endpoint);

  const judged = epRecords.filter(
    (r) => !r.judgeError && r.judge && r.judge.verdict,
  );
  const judgeErrors = epRecords.filter(
    (r) => r.judgeError || !r.judge || !r.judge.verdict,
  );

  const degraded = judged.filter((r) =>
    DEGRADED_VERDICTS.has(r.judge!.verdict),
  );
  const parity = judged.filter((r) => r.judge!.verdict === 'PASS_PARITY');
  const better = judged.filter((r) => r.judge!.verdict === 'PASS_BETTER');
  const fail = judged.filter((r) => r.judge!.verdict === 'FAIL');
  const marginal = judged.filter((r) => r.judge!.verdict === 'PASS_MARGINAL');

  // Determine if we have enough data
  const status: EndpointAnalysis['status'] =
    judged.length >= 10 ? 'ANALYZED' : 'INSUFFICIENT_DATA';

  // Build issue patterns from degraded records
  const issueMap = new Map<
    string,
    { field: string; severity: string; examples: PatternExample[] }
  >();

  for (const r of degraded) {
    if (!r.judge?.issues) continue;
    for (const iss of r.judge.issues) {
      const key = `${iss.field}|${iss.severity}`;
      let entry = issueMap.get(key);
      if (!entry) {
        entry = { field: iss.field, severity: iss.severity, examples: [] };
        issueMap.set(key, entry);
      }
      if (entry.examples.length < 5) {
        entry.examples.push({
          caseId: r.caseId,
          model: r.model,
          what: iss.what,
        });
      }
    }
  }

  const issuePatterns: IssuePattern[] = Array.from(issueMap.entries())
    .map(([key, val]) => ({
      key,
      field: val.field,
      severity: val.severity,
      count: val.examples.length, // count unique occurrences (up to 5)
      examples: val.examples,
    }))
    // Recount properly — count all occurrences, not limited by examples cap
    .map((p) => {
      let count = 0;
      for (const r of degraded) {
        if (!r.judge?.issues) continue;
        for (const iss of r.judge.issues) {
          if (`${iss.field}|${iss.severity}` === p.key) count++;
        }
      }
      return { ...p, count };
    })
    .filter((p) => p.count >= minCases)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  // Build diff patterns from degraded records
  const diffMap = new Map<
    string,
    { field: string; examples: DiffExample[] }
  >();

  for (const r of degraded) {
    if (!r.judge?.side_by_side_diff) continue;
    for (const d of r.judge.side_by_side_diff) {
      if (d.match === true) continue; // only mismatches
      const key = `diff:${d.field}`;
      let entry = diffMap.get(key);
      if (!entry) {
        entry = { field: d.field, examples: [] };
        diffMap.set(key, entry);
      }
      if (entry.examples.length < 5) {
        entry.examples.push({
          caseId: r.caseId,
          model: r.model,
          referenceValue: truncate(d.reference_value),
          candidateValue: truncate(d.candidate_value),
          comment: d.comment,
        });
      }
    }
  }

  const diffPatterns: DiffPattern[] = Array.from(diffMap.entries())
    .map(([key, val]) => {
      let count = 0;
      for (const r of degraded) {
        if (!r.judge?.side_by_side_diff) continue;
        for (const d of r.judge.side_by_side_diff) {
          if (d.match === true) continue;
          if (`diff:${d.field}` === key) count++;
        }
      }
      return { key, field: val.field, count, examples: val.examples };
    })
    .filter((p) => p.count >= minCases)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  return {
    endpoint,
    totalRecords: epRecords.length,
    judgedRecords: judged.length,
    judgeErrorRecords: judgeErrors.length,
    degradedCount: degraded.length,
    parityCount: parity.length,
    betterCount: better.length,
    failCount: fail.length,
    marginalCount: marginal.length,
    issuePatterns,
    diffPatterns,
    status,
  };
}

export function analyze(
  records: BakeOffRecord[],
  minCases: number,
  topN: number,
  iteration: number,
  inputFile: string,
): AnalysisResult {
  const endpoints: Endpoint[] = [
    'classify',
    'parse-cargo',
    'parse-vessel',
    'parse-recap',
  ];
  return {
    inputFile,
    iteration,
    minCases,
    topN,
    endpoints: endpoints.map((ep) =>
      analyzeEndpoint(records, ep, minCases, topN),
    ),
  };
}

/* ------------------------------------------------------------------ */
/*  Markdown report generator                                          */
/* ------------------------------------------------------------------ */

export function generateReport(analysis: EndpointAnalysis): string {
  const lines: string[] = [];
  lines.push(`# Degraded Pattern Analysis: ${analysis.endpoint}`);
  lines.push('');
  lines.push(`**Status:** ${analysis.status}`);
  lines.push(`**Total records:** ${analysis.totalRecords}`);
  lines.push(`**Judged records:** ${analysis.judgedRecords}`);
  lines.push(`**Judge errors:** ${analysis.judgeErrorRecords}`);
  lines.push('');
  lines.push(
    `| Verdict | Count |`,
  );
  lines.push('|---|---|');
  lines.push(`| PARITY | ${analysis.parityCount} |`);
  lines.push(`| BETTER | ${analysis.betterCount} |`);
  lines.push(`| DEGRADED | ${analysis.degradedCount} |`);
  lines.push(`| MARGINAL | ${analysis.marginalCount} |`);
  lines.push(`| FAIL | ${analysis.failCount} |`);
  lines.push('');

  if (analysis.status === 'INSUFFICIENT_DATA') {
    lines.push(
      '> **INSUFFICIENT_DATA — defer.** Fewer than 10 judged cases; patterns unreliable for prompt tuning.',
    );
    lines.push('');
    return lines.join('\n');
  }

  if (analysis.issuePatterns.length > 0) {
    lines.push('## Top Issue Patterns');
    lines.push('');
    for (const p of analysis.issuePatterns) {
      lines.push(
        `### ${p.field} (${p.severity}) — ${p.count} occurrences`,
      );
      lines.push('');
      for (const ex of p.examples.slice(0, 3)) {
        lines.push(`- **${ex.caseId}** (${ex.model}): ${ex.what}`);
      }
      lines.push('');
    }
  }

  if (analysis.diffPatterns.length > 0) {
    lines.push('## Top Diff Patterns (field mismatches)');
    lines.push('');
    for (const p of analysis.diffPatterns) {
      lines.push(`### ${p.field} — ${p.count} mismatches`);
      lines.push('');
      for (const ex of p.examples.slice(0, 3)) {
        lines.push(
          `- **${ex.caseId}** (${ex.model}): ref=\`${ex.referenceValue}\` → cand=\`${ex.candidateValue}\` — ${ex.comment}`,
        );
      }
      lines.push('');
    }
  }

  if (
    analysis.issuePatterns.length === 0 &&
    analysis.diffPatterns.length === 0
  ) {
    lines.push(
      '> No patterns meeting the minimum frequency threshold were found.',
    );
    lines.push('');
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncate(val: unknown, maxLen = 120): string {
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

function parseArgs(argv: string[]) {
  let inputFile = '';
  let minCases = 3;
  let topN = 3;
  let iter = 0;
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--in':
        inputFile = argv[++i];
        break;
      case '--min-cases':
        minCases = parseInt(argv[++i], 10);
        break;
      case '--top':
        topN = parseInt(argv[++i], 10);
        break;
      case '--iter':
        iter = parseInt(argv[++i], 10);
        break;
    }
  }
  return { inputFile, minCases, topN, iter };
}

function main() {
  const { inputFile, minCases, topN, iter } = parseArgs(process.argv);
  if (!inputFile) {
    console.error('Usage: npx tsx analyze-degraded.ts --in <path.jsonl>');
    process.exit(1);
  }

  const content = readFileSync(resolve(inputFile), 'utf8');
  const records = parseJsonl(content);
  const result = analyze(records, minCases, topN, iter, inputFile);

  const outDir = resolve(
    '.specs/wave-gamma-vertex/bake-off-results',
  );
  mkdirSync(outDir, { recursive: true });

  for (const epAnalysis of result.endpoints) {
    const report = generateReport(epAnalysis);
    const outPath = resolve(
      outDir,
      `degraded-patterns-${epAnalysis.endpoint}-iter${iter}.md`,
    );
    writeFileSync(outPath, report, 'utf8');
    console.log(`Wrote: ${outPath}`);
    console.log(
      `  ${epAnalysis.endpoint}: status=${epAnalysis.status} judged=${epAnalysis.judgedRecords} degraded=${epAnalysis.degradedCount}`,
    );
  }
}

// Only run CLI when executed directly
if (require.main === module) {
  main();
}
