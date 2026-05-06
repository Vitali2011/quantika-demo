/**
 * Report writer tests — Task 7.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AggregateRow } from '../aggregate';
import type { Endpoint } from '../corpus';
import { decide } from '../decide';
import { writeReport } from '../report';

function row(p: Partial<AggregateRow> & { endpoint: Endpoint; model: string }): AggregateRow {
  return {
    endpoint: p.endpoint, model: p.model, cases: 10,
    passRate: 0, parityRate: 0, betterRate: 0, degradedRate: 0, marginalRate: 0, failRate: 0,
    modelErrorRate: 0, parseErrorRate: 0, judgeErrorRate: 0,
    avgCompleteness: 0, avgAccuracy: 0, criticalIssues: 0,
    avgLatencyMs: 1000, p95LatencyMs: 1500,
    avgInputTokens: 100, avgOutputTokens: 50, costPer1kCalls: 1.0,
    ...p,
  };
}

describe('writeReport', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'bakeoff-report-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a markdown report with all required sections', () => {
    const agg: AggregateRow[] = [
      row({ endpoint: 'parse-cargo', model: 'gemini-2.5-flash', parityRate: 0.85, betterRate: 0.05, costPer1kCalls: 0.50 }),
      row({ endpoint: 'parse-cargo', model: 'gemini-2.0-flash', parityRate: 0.60, betterRate: 0.0, costPer1kCalls: 0.20 }),
      row({ endpoint: 'classify', model: 'gemini-2.5-flash', parityRate: 0.50, betterRate: 0.10, costPer1kCalls: 0.30 }),
    ];
    const decisions = decide(agg, {
      recordsHasReference: { 'parse-cargo': true, classify: true },
    });
    const reportPath = writeReport({
      runId: 'test-run-1',
      outDir: tmpDir,
      agg,
      decisions,
    });
    expect(existsSync(reportPath)).toBe(true);
    expect(reportPath).toContain('report-test-run-1.md');
    const content = readFileSync(reportPath, 'utf8');

    expect(content).toContain('# Wave γ Parsing Bake-off Report');
    expect(content).toContain('**Run ID:** test-run-1');
    expect(content).toContain('## Per-endpoint winners');
    expect(content).toContain('## Full aggregation matrix');
    expect(content).toContain('## Production rollout recommendations');
    expect(content).toContain('## Notes');

    // env-vars block: parse-cargo has a winner
    expect(content).toContain('PARSE_CARGO_PROVIDER=gemini');
    expect(content).toContain('PARSE_CARGO_MODEL=gemini-2.5-flash');

    // classify is DEFERRED — env-vars commented out
    expect(content).toContain('# CLASSIFY_PROVIDER=gemini');
    expect(content).toMatch(/classify: DEFERRED/);
  });

  it('matrix is sorted by endpoint then cost ascending', () => {
    const agg: AggregateRow[] = [
      row({ endpoint: 'parse-cargo', model: 'pricey', costPer1kCalls: 5.0, parityRate: 0.9 }),
      row({ endpoint: 'parse-cargo', model: 'cheap',  costPer1kCalls: 0.1, parityRate: 0.9 }),
      row({ endpoint: 'classify',    model: 'mid',    costPer1kCalls: 1.0, parityRate: 0.9 }),
    ];
    const decisions = decide(agg, {
      recordsHasReference: { 'parse-cargo': true, classify: true },
    });
    const reportPath = writeReport({
      runId: 'sort-test',
      outDir: tmpDir,
      agg,
      decisions,
    });
    const content = readFileSync(reportPath, 'utf8');
    // Find matrix section
    const matrixStart = content.indexOf('## Full aggregation matrix');
    const slice = content.slice(matrixStart);
    const cheapIdx = slice.indexOf('| parse-cargo | cheap');
    const priceyIdx = slice.indexOf('| parse-cargo | pricey');
    const classifyIdx = slice.indexOf('| classify |');
    expect(classifyIdx).toBeGreaterThan(0);
    expect(cheapIdx).toBeGreaterThan(0);
    expect(priceyIdx).toBeGreaterThan(cheapIdx);
    // classify sorts before parse-cargo alphabetically
    expect(classifyIdx).toBeLessThan(cheapIdx);
  });

  it('Notes section reflects Mode B when no references', () => {
    const agg: AggregateRow[] = [
      row({ endpoint: 'parse-cargo', model: 'm1', parityRate: 0.85, betterRate: 0.0, costPer1kCalls: 0.5 }),
    ];
    const decisions = decide(agg, { recordsHasReference: { 'parse-cargo': false } });
    const reportPath = writeReport({
      runId: 'modeb-test',
      outDir: tmpDir,
      agg,
      decisions,
    });
    const content = readFileSync(reportPath, 'utf8');
    expect(content).toContain('Mode used: B');
    expect(content).toContain('80%');
  });
});
