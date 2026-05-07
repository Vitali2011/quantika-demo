import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runBakeOff, type BakeOffDeps } from '../orchestrator';
import type { CorpusCase, Endpoint } from '../corpus';
import type { EndpointSpec } from '../endpoint-specs';
import type { RunCandidateInput, RunCandidateResult } from '../run-candidate';
import type { JudgeInput, JudgeOutput, JudgeOptions } from '../judge';

/**
 * Tests use the orchestrator's `deps` DI seam (mirroring `judge.test.ts`'s
 * pattern) rather than `jest.mock('../foo', ...)`. ts-jest + nextJest's
 * relative-path module mocking is fragile and the project's existing tests
 * standardize on injection.
 */

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'bake-off-test-'));
afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

const ONE_MODEL = [
  { id: 'gemini-2.5-flash', apiId: 'gemini-2.5-flash', inputPerMTokens: 0.3, outputPerMTokens: 2.5 },
];

function makeSpec(): EndpointSpec {
  return { systemPrompt: 'SYSTEM', outputSchema: {} };
}

describe('runBakeOff', () => {
  let runCandidate: jest.MockedFunction<(input: RunCandidateInput) => Promise<RunCandidateResult>>;
  let judge: jest.MockedFunction<(input: JudgeInput, options?: JudgeOptions) => Promise<JudgeOutput>>;
  let getEndpointSpec: jest.MockedFunction<(e: Endpoint) => EndpointSpec>;
  let deps: BakeOffDeps;

  beforeEach(() => {
    runCandidate = jest.fn<(input: RunCandidateInput) => Promise<RunCandidateResult>>();
    judge = jest.fn<(input: JudgeInput, options?: JudgeOptions) => Promise<JudgeOutput>>();
    getEndpointSpec = jest.fn<(e: Endpoint) => EndpointSpec>().mockImplementation(() => makeSpec());
    deps = {
      loadCorpus: async () => [],
      getEndpointSpec,
      runCandidate,
      judge,
    };
  });

  it('happy path: 1 case x 2 endpoints x 1 model -> 2 records, runId in ISO format, jsonl exists', async () => {
    const corpus: CorpusCase[] = [
      { id: 'case-1', email: 'hello', endpoints: ['parse-cargo', 'classify'], references: {}, source: 's' },
    ];
    runCandidate.mockResolvedValue({
      outputText: '{"items":[]}',
      outputJson: { items: [] },
      latencyMs: 10,
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.0001,
    });
    judge.mockResolvedValue({
      completeness: 90, accuracy: 90, format_validity: 1,
      issues: [], side_by_side_diff: [], verdict: 'PASS_PARITY', rationale: 'ok',
    });

    const { records, runId, jsonlPath } = await runBakeOff({
      outDir: tmpRoot,
      concurrency: 2,
      models: ONE_MODEL,
      corpus,
      deps,
      progress: () => {},
    });

    expect(records).toHaveLength(2);
    expect(runId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
    expect(existsSync(jsonlPath)).toBe(true);
    const lines = readFileSync(jsonlPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    for (const r of records) {
      expect(r.judge?.verdict).toBe('PASS_PARITY');
      expect(r.judgeMode).toBe('B');
      expect(r.candidateLabel).toMatch(/^Candidate-[A-Z]$/);
      expect(r.judgeError).toBeUndefined();
    }
  });

  it('skips judge when runCandidate returns modelError', async () => {
    runCandidate.mockResolvedValue({
      outputText: '', outputJson: null,
      latencyMs: 5, inputTokens: 0, outputTokens: 0, costUsd: 0,
      modelError: 'timeout',
    });

    const { records } = await runBakeOff({
      outDir: tmpRoot, concurrency: 1, models: ONE_MODEL,
      corpus: [{ id: 'c1', email: 'x', endpoints: ['classify'], references: {}, source: 's' }],
      deps, progress: () => {},
    });

    expect(records).toHaveLength(1);
    expect(records[0].modelError).toBe('timeout');
    expect(records[0].judge).toBeNull();
    expect(records[0].judgeError).toBeUndefined();
    expect(judge).not.toHaveBeenCalled();
  });

  it('captures judgeError when judge throws', async () => {
    runCandidate.mockResolvedValue({
      outputText: '{"category":"general"}',
      outputJson: { category: 'general' },
      latencyMs: 5, inputTokens: 50, outputTokens: 10, costUsd: 0.00005,
    });
    judge.mockRejectedValue(new Error('Judge response failed to parse as JSON: Unexpected token'));

    const { records } = await runBakeOff({
      outDir: tmpRoot, concurrency: 1, models: ONE_MODEL,
      corpus: [{ id: 'c1', email: 'x', endpoints: ['classify'], references: {}, source: 's' }],
      deps, progress: () => {},
    });

    expect(records).toHaveLength(1);
    expect(records[0].judge).toBeNull();
    expect(records[0].judgeError).toMatch(/Judge response failed/);
  });

  it('anti-leak: candidateLabel passed to judge does NOT contain the model id', async () => {
    runCandidate.mockResolvedValue({
      outputText: '{}', outputJson: {},
      latencyMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0,
    });
    judge.mockResolvedValue({
      completeness: 100, accuracy: 100, format_validity: 1,
      issues: [], side_by_side_diff: [], verdict: 'PASS_PARITY', rationale: 'ok',
    });

    await runBakeOff({
      outDir: tmpRoot, concurrency: 1, models: ONE_MODEL,
      corpus: [{ id: 'c1', email: 'x', endpoints: ['classify'], references: {}, source: 's' }],
      deps, progress: () => {},
    });

    expect(judge).toHaveBeenCalledTimes(1);
    const judgeArg = judge.mock.calls[0][0] as { candidateLabel: string };
    expect(judgeArg.candidateLabel).toMatch(/^Candidate-[A-Z]$/);
    expect(judgeArg.candidateLabel).not.toContain('gemini');
    expect(judgeArg.candidateLabel).not.toContain('flash');
  });
});
