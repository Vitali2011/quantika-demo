/**
 * Decision engine tests — Task 7.
 */

import { describe, it, expect } from '@jest/globals';
import type { AggregateRow } from '../aggregate';
import type { Endpoint } from '../corpus';
import { decide } from '../decide';

function row(partial: Partial<AggregateRow> & { endpoint: Endpoint; model: string }): AggregateRow {
  return {
    endpoint: partial.endpoint,
    model: partial.model,
    cases: 10,
    passRate: 0,
    parityRate: 0,
    betterRate: 0,
    degradedRate: 0,
    marginalRate: 0,
    failRate: 0,
    modelErrorRate: 0,
    parseErrorRate: 0,
    judgeErrorRate: 0,
    avgCompleteness: 0,
    avgAccuracy: 0,
    criticalIssues: 0,
    avgLatencyMs: 1000,
    p95LatencyMs: 1500,
    avgInputTokens: 100,
    avgOutputTokens: 50,
    costPer1kCalls: 1.0,
    ...partial,
  };
}

describe('decide', () => {
  it('disqualifies models with criticalIssues > 0', () => {
    const rows = [
      row({ endpoint: 'parse-cargo', model: 'm1', parityRate: 0.9, betterRate: 0.05, criticalIssues: 1, costPer1kCalls: 0.5 }),
      row({ endpoint: 'parse-cargo', model: 'm2', parityRate: 0.85, betterRate: 0.05, costPer1kCalls: 1.0 }),
    ];
    const d = decide(rows, { recordsHasReference: { 'parse-cargo': true } });
    expect(d['parse-cargo'].disqualified).toEqual(['m1']);
    expect(d['parse-cargo'].winner).toBe('m2');
  });

  it('picks the cheapest model passing the Mode A gate (85%)', () => {
    const rows = [
      row({ endpoint: 'parse-cargo', model: 'cheap-but-low', parityRate: 0.7, betterRate: 0.1, costPer1kCalls: 0.10 }),
      row({ endpoint: 'parse-cargo', model: 'cheap-pass',   parityRate: 0.85, betterRate: 0.05, costPer1kCalls: 0.50 }),
      row({ endpoint: 'parse-cargo', model: 'pricey-pass',  parityRate: 0.95, betterRate: 0.0, costPer1kCalls: 5.00 }),
    ];
    const d = decide(rows, { recordsHasReference: { 'parse-cargo': true } });
    expect(d['parse-cargo'].winner).toBe('cheap-pass');
    expect(d['parse-cargo'].qualified.sort()).toEqual(['cheap-pass', 'pricey-pass']);
    expect(d['parse-cargo'].flags).not.toContain('mode-b');
  });

  it('returns DEFERRED when nobody passes', () => {
    const rows = [
      row({ endpoint: 'classify', model: 'm1', parityRate: 0.5, betterRate: 0.2, costPer1kCalls: 1.0 }),
      row({ endpoint: 'classify', model: 'm2', parityRate: 0.6, betterRate: 0.1, criticalIssues: 2 }),
    ];
    const d = decide(rows, { recordsHasReference: { classify: true } });
    expect(d.classify.winner).toBe('DEFERRED');
    expect(d.classify.rationale).toMatch(/below.*gate/i);
  });

  it('flags single-passing when only one model qualifies', () => {
    const rows = [
      row({ endpoint: 'parse-vessel', model: 'lone',  parityRate: 0.9, betterRate: 0.0, costPer1kCalls: 1.0 }),
      row({ endpoint: 'parse-vessel', model: 'low',   parityRate: 0.5, betterRate: 0.0, costPer1kCalls: 0.5 }),
    ];
    const d = decide(rows, { recordsHasReference: { 'parse-vessel': true } });
    expect(d['parse-vessel'].winner).toBe('lone');
    expect(d['parse-vessel'].flags).toContain('single-passing');
  });

  it('applies Mode B lower gate (80%) when no reference', () => {
    const rows = [
      row({ endpoint: 'parse-recap', model: 'm-modeb', parityRate: 0.80, betterRate: 0.0, costPer1kCalls: 0.5 }),
      row({ endpoint: 'parse-recap', model: 'm-low',   parityRate: 0.70, betterRate: 0.0, costPer1kCalls: 0.1 }),
    ];
    const d = decide(rows, { recordsHasReference: { 'parse-recap': false } });
    expect(d['parse-recap'].winner).toBe('m-modeb');
    expect(d['parse-recap'].flags).toContain('mode-b');
  });

  it('tiebreaks within 10% cost band by parity+better, then latency', () => {
    const rows = [
      row({ endpoint: 'classify', model: 'cheap',     parityRate: 0.85, betterRate: 0.0, costPer1kCalls: 1.00, avgLatencyMs: 500 }),
      row({ endpoint: 'classify', model: 'almost',    parityRate: 0.95, betterRate: 0.0, costPer1kCalls: 1.05, avgLatencyMs: 800 }),
      row({ endpoint: 'classify', model: 'expensive', parityRate: 0.99, betterRate: 0.0, costPer1kCalls: 2.00, avgLatencyMs: 200 }),
    ];
    const d = decide(rows, { recordsHasReference: { classify: true } });
    // 'almost' is within 10% of cheap (1.00 → band 1.10) and has higher quality
    expect(d.classify.winner).toBe('almost');
  });

  it('flags preview-stability-risk when winner is a preview model', () => {
    const rows = [
      row({ endpoint: 'parse-cargo', model: 'gemini-3.1-flash-lite-preview', parityRate: 0.9, betterRate: 0.0, costPer1kCalls: 0.2 }),
      row({ endpoint: 'parse-cargo', model: 'gemini-2.5-flash',              parityRate: 0.85, betterRate: 0.0, costPer1kCalls: 0.5 }),
    ];
    const d = decide(rows, { recordsHasReference: { 'parse-cargo': true } });
    expect(d['parse-cargo'].winner).toBe('gemini-3.1-flash-lite-preview');
    expect(d['parse-cargo'].flags).toContain('preview-stability-risk');
  });

  it('practical mode disqualifies on critical issues', () => {
    const rows = [
      row({ endpoint: 'parse-cargo', model: 'cheap-crit', passRate: 0.95, criticalIssues: 1, costPer1kCalls: 0.1 }),
      row({ endpoint: 'parse-cargo', model: 'pricey-clean', passRate: 0.85, criticalIssues: 0, costPer1kCalls: 1.0 }),
    ];
    const d = decide(rows, { gateMode: 'practical', recordsHasReference: { 'parse-cargo': true } });
    expect(d['parse-cargo'].disqualified).toEqual(['cheap-crit']);
    expect(d['parse-cargo'].winner).toBe('pricey-clean');
    expect(d['parse-cargo'].flags).toContain('practical-gate');
  });

  it('practical mode picks cheapest model with passRate >= 80%', () => {
    const rows = [
      row({ endpoint: 'parse-cargo', model: 'cheap-low', passRate: 0.70, costPer1kCalls: 0.05 }),
      row({ endpoint: 'parse-cargo', model: 'cheap-pass', passRate: 0.82, costPer1kCalls: 0.20 }),
      row({ endpoint: 'parse-cargo', model: 'pricey-better', passRate: 0.95, costPer1kCalls: 2.00 }),
    ];
    const d = decide(rows, { gateMode: 'practical', recordsHasReference: { 'parse-cargo': true } });
    expect(d['parse-cargo'].winner).toBe('cheap-pass');
    expect(d['parse-cargo'].qualified.sort()).toEqual(['cheap-pass', 'pricey-better']);
  });

  it('practical mode flag appears in result', () => {
    const rows = [
      row({ endpoint: 'classify', model: 'm1', passRate: 0.90, costPer1kCalls: 0.5 }),
    ];
    const d = decide(rows, { gateMode: 'practical', recordsHasReference: { classify: true } });
    expect(d.classify.flags).toContain('practical-gate');
    expect(d.classify.winner).toBe('m1');
  });

  it('rankedByCost is sorted ascending and only contains qualified models', () => {
    const rows = [
      row({ endpoint: 'parse-cargo', model: 'a', parityRate: 0.9, betterRate: 0.0, costPer1kCalls: 2.0 }),
      row({ endpoint: 'parse-cargo', model: 'b', parityRate: 0.9, betterRate: 0.0, costPer1kCalls: 0.5 }),
      row({ endpoint: 'parse-cargo', model: 'c', parityRate: 0.5, betterRate: 0.0, costPer1kCalls: 0.1 }),
    ];
    const d = decide(rows, { recordsHasReference: { 'parse-cargo': true } });
    expect(d['parse-cargo'].rankedByCost.map((r) => r.model)).toEqual(['b', 'a']);
  });
});
