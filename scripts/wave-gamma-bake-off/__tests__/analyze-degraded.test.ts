/**
 * Tests for analyze-degraded.ts — Spec 04 degraded pattern analyzer.
 */

import { describe, it, expect } from '@jest/globals';

import type { BakeOffRecord } from '../orchestrator';
import type { JudgeOutput } from '../judge';
import {
  parseJsonl,
  analyzeEndpoint,
  analyze,
  generateReport,
} from '../analyze-degraded';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function judgeOk(
  verdict: JudgeOutput['verdict'],
  opts: {
    issues?: JudgeOutput['issues'];
    diffs?: JudgeOutput['side_by_side_diff'];
  } = {},
): JudgeOutput {
  return {
    completeness: 80,
    accuracy: 80,
    format_validity: 1,
    issues: opts.issues ?? [],
    side_by_side_diff: opts.diffs ?? [],
    verdict,
    rationale: 'test',
  };
}

function rec(over: Partial<BakeOffRecord>): BakeOffRecord {
  return {
    runId: 'r1',
    caseId: 'c1',
    endpoint: 'classify',
    model: 'gemini-2.5-flash',
    candidateLabel: 'Candidate-A',
    candidateOutput: {},
    latencyMs: 1000,
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.001,
    judgeMode: 'A',
    judge: null,
    ...over,
  } as BakeOffRecord;
}

/* ------------------------------------------------------------------ */
/*  parseJsonl                                                         */
/* ------------------------------------------------------------------ */

describe('parseJsonl', () => {
  it('parses valid JSONL', () => {
    const input =
      '{"runId":"r1","endpoint":"classify"}\n{"runId":"r2","endpoint":"parse-cargo"}\n';
    const result = parseJsonl(input);
    expect(result).toHaveLength(2);
    expect(result[0].runId).toBe('r1');
    expect(result[1].endpoint).toBe('parse-cargo');
  });

  it('handles trailing newlines', () => {
    const input = '{"runId":"r1"}\n\n';
    const result = parseJsonl(input);
    expect(result).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  analyzeEndpoint                                                    */
/* ------------------------------------------------------------------ */

describe('analyzeEndpoint', () => {
  it('returns INSUFFICIENT_DATA when fewer than 10 judged records', () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      rec({
        caseId: `c${i}`,
        judge: judgeOk('PASS_DEGRADED', {
          issues: [{ field: 'urgency', severity: 'med', what: 'test' }],
        }),
      }),
    );
    const result = analyzeEndpoint(records, 'classify', 3, 3);
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.judgedRecords).toBe(5);
  });

  it('returns ANALYZED when 10+ judged records exist', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      rec({
        caseId: `c${i}`,
        judge: judgeOk(i < 5 ? 'PASS_DEGRADED' : 'PASS_PARITY', {
          issues:
            i < 5
              ? [{ field: 'urgency', severity: 'med', what: `issue ${i}` }]
              : [],
        }),
      }),
    );
    const result = analyzeEndpoint(records, 'classify', 3, 3);
    expect(result.status).toBe('ANALYZED');
    expect(result.judgedRecords).toBe(12);
    expect(result.degradedCount).toBe(5);
    expect(result.parityCount).toBe(7);
  });

  it('filters issue patterns by minCases threshold', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      rec({
        caseId: `c${i}`,
        judge: judgeOk('PASS_DEGRADED', {
          issues: [
            // This pattern appears in all 12 records
            { field: 'urgency', severity: 'med', what: 'common issue' },
            // This pattern appears only in first 2
            ...(i < 2
              ? [
                  {
                    field: 'rare_field',
                    severity: 'low' as const,
                    what: 'rare issue',
                  },
                ]
              : []),
          ],
        }),
      }),
    );
    // minCases=3 should filter out rare_field|low (only 2 occurrences)
    const result = analyzeEndpoint(records, 'classify', 3, 10);
    expect(
      result.issuePatterns.find((p) => p.key === 'urgency|med'),
    ).toBeTruthy();
    expect(
      result.issuePatterns.find((p) => p.key === 'rare_field|low'),
    ).toBeUndefined();
  });

  it('limits results to topN', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      rec({
        caseId: `c${i}`,
        judge: judgeOk('PASS_DEGRADED', {
          issues: [
            { field: 'f1', severity: 'med', what: 'a' },
            { field: 'f2', severity: 'low', what: 'b' },
            { field: 'f3', severity: 'high', what: 'c' },
            { field: 'f4', severity: 'crit', what: 'd' },
          ],
        }),
      }),
    );
    const result = analyzeEndpoint(records, 'classify', 1, 2);
    // Should have at most 2 issue patterns
    expect(result.issuePatterns.length).toBeLessThanOrEqual(2);
  });

  it('extracts diff patterns from side_by_side_diff', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      rec({
        caseId: `c${i}`,
        judge: judgeOk('PASS_DEGRADED', {
          diffs: [
            {
              field: 'confidence',
              reference_value: null,
              candidate_value: 0.98,
              match: false,
              comment: 'overconfident',
            },
            {
              field: 'urgency',
              reference_value: 'medium',
              candidate_value: 'high',
              match: false,
              comment: 'wrong urgency',
            },
            {
              field: 'category',
              reference_value: 'CARGO_INQUIRY',
              candidate_value: 'CARGO_INQUIRY',
              match: true,
              comment: 'ok',
            },
          ],
        }),
      }),
    );
    const result = analyzeEndpoint(records, 'classify', 3, 5);
    expect(result.diffPatterns.length).toBeGreaterThanOrEqual(2);
    // category should NOT appear (match=true)
    expect(
      result.diffPatterns.find((p) => p.field === 'category'),
    ).toBeUndefined();
    // confidence and urgency should appear
    expect(
      result.diffPatterns.find((p) => p.field === 'confidence'),
    ).toBeTruthy();
    expect(
      result.diffPatterns.find((p) => p.field === 'urgency'),
    ).toBeTruthy();
  });

  it('ignores records from other endpoints', () => {
    const records = [
      rec({
        endpoint: 'classify',
        caseId: 'c1',
        judge: judgeOk('PASS_PARITY'),
      }),
      rec({
        endpoint: 'parse-cargo',
        caseId: 'c2',
        judge: judgeOk('PASS_DEGRADED'),
      }),
    ];
    const result = analyzeEndpoint(records, 'classify', 1, 3);
    expect(result.totalRecords).toBe(1);
    expect(result.judgedRecords).toBe(1);
  });

  it('counts judgeError records correctly', () => {
    const records = [
      rec({ caseId: 'ok', judge: judgeOk('PASS_PARITY') }),
      rec({ caseId: 'err1', judgeError: 'timeout' }),
      rec({ caseId: 'err2', judge: null }),
    ];
    const result = analyzeEndpoint(records, 'classify', 1, 3);
    expect(result.judgedRecords).toBe(1);
    expect(result.judgeErrorRecords).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  analyze (full pipeline)                                            */
/* ------------------------------------------------------------------ */

describe('analyze', () => {
  it('produces analysis for all 4 endpoints', () => {
    const records = [
      rec({ endpoint: 'classify', judge: judgeOk('PASS_PARITY') }),
      rec({ endpoint: 'parse-cargo', judge: judgeOk('PASS_PARITY') }),
      rec({ endpoint: 'parse-vessel', judge: judgeOk('PASS_PARITY') }),
      rec({ endpoint: 'parse-recap', judge: judgeOk('PASS_PARITY') }),
    ];
    const result = analyze(records, 3, 3, 0, 'test.jsonl');
    expect(result.endpoints).toHaveLength(4);
    expect(result.endpoints.map((e) => e.endpoint)).toEqual([
      'classify',
      'parse-cargo',
      'parse-vessel',
      'parse-recap',
    ]);
  });

  it('returns empty patterns for empty input', () => {
    const result = analyze([], 3, 3, 0, 'test.jsonl');
    for (const ep of result.endpoints) {
      expect(ep.status).toBe('INSUFFICIENT_DATA');
      expect(ep.issuePatterns).toEqual([]);
      expect(ep.diffPatterns).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  generateReport                                                     */
/* ------------------------------------------------------------------ */

describe('generateReport', () => {
  it('generates INSUFFICIENT_DATA markdown for small datasets', () => {
    const analysis = analyzeEndpoint(
      [rec({ judge: judgeOk('PASS_DEGRADED') })],
      'classify',
      3,
      3,
    );
    const report = generateReport(analysis);
    expect(report).toContain('INSUFFICIENT_DATA');
    expect(report).toContain('Fewer than 10 judged cases');
  });

  it('generates ANALYZED report with issue patterns', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      rec({
        caseId: `c${i}`,
        judge: judgeOk('PASS_DEGRADED', {
          issues: [
            { field: 'urgency', severity: 'med', what: `wrong urgency ${i}` },
          ],
        }),
      }),
    );
    const analysis = analyzeEndpoint(records, 'classify', 3, 3);
    const report = generateReport(analysis);
    expect(report).toContain('# Degraded Pattern Analysis: classify');
    expect(report).toContain('ANALYZED');
    expect(report).toContain('urgency (med)');
    expect(report).toContain('occurrences');
  });

  it('includes diff patterns in report', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      rec({
        caseId: `c${i}`,
        judge: judgeOk('PASS_DEGRADED', {
          diffs: [
            {
              field: 'urgency',
              reference_value: 'medium',
              candidate_value: 'high',
              match: false,
              comment: 'wrong',
            },
          ],
        }),
      }),
    );
    const analysis = analyzeEndpoint(records, 'classify', 3, 3);
    const report = generateReport(analysis);
    expect(report).toContain('Diff Patterns');
    expect(report).toContain('urgency');
  });
});
