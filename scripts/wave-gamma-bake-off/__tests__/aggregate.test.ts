/**
 * Aggregator tests — Task 6 of Wave γ parsing bake-off.
 *
 * Builds a small synthetic BakeOffRecord[] mixing every "no verdict" path
 * (modelError, parseError-only, judgeError) plus PASS_PARITY / PASS_BETTER /
 * FAIL, and asserts the per-(endpoint, model) aggregate row math.
 */

import { describe, it, expect } from '@jest/globals';

import type { BakeOffRecord } from '../orchestrator';
import type { JudgeOutput } from '../judge';
import { aggregate } from '../aggregate';

function judgeOk(
  verdict: JudgeOutput['verdict'],
  completeness: number,
  accuracy: number,
  critIssues = 0,
): JudgeOutput {
  return {
    completeness,
    accuracy,
    format_validity: 1,
    issues: Array.from({ length: critIssues }, (_, i) => ({
      field: `f${i}`,
      severity: 'crit' as const,
      what: 'bad',
    })),
    side_by_side_diff: [],
    verdict,
    rationale: '',
  };
}

function rec(over: Partial<BakeOffRecord>): BakeOffRecord {
  return {
    runId: 'r1',
    caseId: 'c1',
    endpoint: 'parse-cargo',
    model: 'gemini-flash',
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

describe('aggregate', () => {
  it('produces one row per (endpoint, model) combination', () => {
    const records = [
      rec({ endpoint: 'parse-cargo', model: 'gemini-flash', judge: judgeOk('PASS_PARITY', 90, 90) }),
      rec({ endpoint: 'parse-cargo', model: 'gemini-pro', judge: judgeOk('PASS_BETTER', 95, 95) }),
      rec({ endpoint: 'parse-vessel', model: 'gemini-flash', judge: judgeOk('FAIL', 50, 40) }),
    ] as BakeOffRecord[];
    const rows = aggregate(records);
    expect(rows).toHaveLength(3);
    const keys = rows.map((r) => `${r.endpoint}|${r.model}`).sort();
    expect(keys).toEqual([
      'parse-cargo|gemini-flash',
      'parse-cargo|gemini-pro',
      'parse-vessel|gemini-flash',
    ]);
  });

  it('uses cases (group total) as denominator for all rates', () => {
    // 4 records all same (endpoint, model): 1 PASS_PARITY, 1 PASS_BETTER, 1 FAIL, 1 modelError
    const records = [
      rec({ judge: judgeOk('PASS_PARITY', 80, 80) }),
      rec({ judge: judgeOk('PASS_BETTER', 90, 85) }),
      rec({ judge: judgeOk('FAIL', 30, 30) }),
      rec({ modelError: 'timeout', candidateOutput: null }),
    ] as BakeOffRecord[];
    const rows = aggregate(records);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.cases).toBe(4);
    // passRate = 2/4 (PASS_PARITY + PASS_BETTER)
    expect(r.passRate).toBeCloseTo(0.5);
    expect(r.parityRate).toBeCloseTo(0.25);
    expect(r.betterRate).toBeCloseTo(0.25);
    expect(r.failRate).toBeCloseTo(0.25);
    expect(r.modelErrorRate).toBeCloseTo(0.25);
    expect(r.parseErrorRate).toBe(0);
    expect(r.judgeErrorRate).toBe(0);
  });

  it('avgCompleteness/avgAccuracy only over records with judge (no NaN when all null)', () => {
    const records = [
      rec({ modelError: 'x', candidateOutput: null }),
      rec({ parseError: 'bad json' }),
      rec({ judgeError: 'judge timeout' }),
    ] as BakeOffRecord[];
    const rows = aggregate(records);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.avgCompleteness).toBe(0);
    expect(r.avgAccuracy).toBe(0);
    expect(Number.isNaN(r.avgCompleteness)).toBe(false);
    expect(Number.isNaN(r.avgAccuracy)).toBe(false);
    expect(r.modelErrorRate).toBeCloseTo(1 / 3);
    expect(r.parseErrorRate).toBeCloseTo(1 / 3);
    expect(r.judgeErrorRate).toBeCloseTo(1 / 3);
  });

  it('counts critical issues across records', () => {
    const records = [
      rec({ judge: judgeOk('PASS_PARITY', 80, 80, 2) }),
      rec({ judge: judgeOk('FAIL', 30, 30, 3) }),
      rec({ judge: judgeOk('PASS_BETTER', 90, 90, 0) }),
    ] as BakeOffRecord[];
    const r = aggregate(records)[0];
    expect(r.criticalIssues).toBe(5);
  });

  it('costPer1kCalls = avg cost × 1000', () => {
    const records = [
      rec({ costUsd: 0.001, judge: judgeOk('PASS_PARITY', 80, 80) }),
      rec({ costUsd: 0.003, judge: judgeOk('PASS_PARITY', 80, 80) }),
    ] as BakeOffRecord[];
    const r = aggregate(records)[0];
    // avg = 0.002, ×1000 = 2.0
    expect(r.costPer1kCalls).toBeCloseTo(2.0);
  });

  it('handles empty input and single record', () => {
    expect(aggregate([])).toEqual([]);
    const single = aggregate([
      rec({ judge: judgeOk('PASS_PARITY', 100, 100), latencyMs: 500, costUsd: 0.0005 }),
    ] as BakeOffRecord[]);
    expect(single).toHaveLength(1);
    expect(single[0].cases).toBe(1);
    expect(single[0].passRate).toBe(1);
    expect(single[0].parityRate).toBe(1);
    expect(single[0].avgLatencyMs).toBe(500);
    expect(single[0].p95LatencyMs).toBe(500);
    expect(single[0].avgCompleteness).toBe(100);
    expect(single[0].costPer1kCalls).toBeCloseTo(0.5);
  });

  it('computes p95 latency from sorted latencies', () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      rec({ latencyMs: (i + 1) * 100, judge: judgeOk('PASS_PARITY', 80, 80) }),
    ) as BakeOffRecord[];
    const r = aggregate(records)[0];
    // 20 values: 100..2000. p95 index = ceil(0.95*20)-1 = 18 → 1900
    expect(r.p95LatencyMs).toBe(1900);
    expect(r.avgLatencyMs).toBe(1050);
  });

  it('counts PASS_DEGRADED and PASS_MARGINAL into degradedRate/marginalRate', () => {
    const records = [
      rec({ judge: judgeOk('PASS_DEGRADED', 70, 70) }),
      rec({ judge: judgeOk('PASS_MARGINAL', 60, 60) }),
      rec({ judge: judgeOk('PASS_PARITY', 80, 80) }),
      rec({ judge: judgeOk('FAIL', 20, 20) }),
    ] as BakeOffRecord[];
    const r = aggregate(records)[0];
    expect(r.degradedRate).toBeCloseTo(0.25);
    expect(r.marginalRate).toBeCloseTo(0.25);
    // passRate counts ALL PASS_* (parity + better + degraded + marginal)
    expect(r.passRate).toBeCloseTo(0.75);
  });
});
