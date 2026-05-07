import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import {
  stripFences,
  extractWithRetry,
  classifyDiff,
  type CallAiTextFn,
  type DiffClassification,
} from '../build-ground-truth';
import { deepFieldDiff, deepEqual, type DiffSummary } from '../diff-utils';

// ─── Mock setup (DI pattern — same as validate-baseline.test.ts) ────────────

const callMock = jest.fn<CallAiTextFn>();

const fakeCallAiText: CallAiTextFn = (scope, system, user, opts) =>
  callMock(scope, system, user, opts);

beforeEach(() => {
  callMock.mockReset();
});

// ─── stripFences ────────────────────────────────────────────────────────────────

describe('stripFences', () => {
  it('strips ```json ... ``` fences', () => {
    const input = '```json\n{"a": 1}\n```';
    expect(stripFences(input)).toBe('{"a": 1}');
  });

  it('strips ``` fences without json tag', () => {
    const input = '```\n{"a": 1}\n```';
    expect(stripFences(input)).toBe('{"a": 1}');
  });

  it('leaves clean JSON untouched', () => {
    const input = '{"a": 1}';
    expect(stripFences(input)).toBe('{"a": 1}');
  });

  it('extracts JSON from preamble text', () => {
    const input = "I'll parse this cargo email for you.\n\n{\"items\": [{\"cargo\": \"wheat\"}]}";
    const result = stripFences(input);
    expect(JSON.parse(result)).toEqual({ items: [{ cargo: 'wheat' }] });
  });

  it('extracts JSON array from preamble text', () => {
    const input = 'Here is the result:\n[{"a": 1}, {"b": 2}]';
    const result = stripFences(input);
    expect(JSON.parse(result)).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

// ─── deepEqual ──────────────────────────────────────────────────────────────────

describe('deepEqual', () => {
  it('treats null and undefined as equal', () => {
    expect(deepEqual(null, undefined)).toBe(true);
    expect(deepEqual(undefined, null)).toBe(true);
  });

  it('compares numbers with tolerance', () => {
    expect(deepEqual(3.14, 3.14159, { numericTolerance: 0.01 })).toBe(true);
    expect(deepEqual(3.14, 3.20, { numericTolerance: 0.01 })).toBe(false);
  });

  it('compares strings case-insensitively when configured', () => {
    expect(deepEqual('Hello', 'hello', { caseInsensitive: true })).toBe(true);
    expect(deepEqual('Hello', 'hello')).toBe(false);
  });

  it('compares arrays recursively', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('compares nested objects recursively', () => {
    const a = { x: { y: 1, z: 'hi' } };
    const b = { x: { y: 1, z: 'hi' } };
    expect(deepEqual(a, b)).toBe(true);
  });

  it('returns false for different types', () => {
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(true, 1)).toBe(false);
  });
});

// ─── deepFieldDiff ──────────────────────────────────────────────────────────────

describe('deepFieldDiff', () => {
  it('reports all matching for identical objects', () => {
    const a = { name: 'Alpha', count: 5 };
    const b = { name: 'Alpha', count: 5 };
    const result = deepFieldDiff(a, b);

    expect(result.matching).toBe(2);
    expect(result.mismatching).toBe(0);
    expect(result.aOnly).toBe(0);
    expect(result.bOnly).toBe(0);
  });

  it('reports field present in a only', () => {
    const a = { name: 'Alpha', extra: true };
    const b = { name: 'Alpha' };
    const result = deepFieldDiff(a, b);

    expect(result.aOnly).toBe(1);
    expect(result.fields.find((f) => f.field === 'extra')?.status).toBe('a_only');
  });

  it('reports field present in b only', () => {
    const a = { name: 'Alpha' };
    const b = { name: 'Alpha', extra: true };
    const result = deepFieldDiff(a, b);

    expect(result.bOnly).toBe(1);
    expect(result.fields.find((f) => f.field === 'extra')?.status).toBe('b_only');
  });

  it('reports mismatch for differing field values', () => {
    const a = { name: 'Alpha', count: 5 };
    const b = { name: 'Beta', count: 5 };
    const result = deepFieldDiff(a, b);

    expect(result.mismatching).toBe(1);
    expect(result.matching).toBe(1);
  });

  it('handles null/undefined inputs as empty objects', () => {
    const result = deepFieldDiff(null, undefined);
    expect(result.totalFields).toBe(0);
  });
});

// ─── classifyDiff ───────────────────────────────────────────────────────────────

describe('classifyDiff', () => {
  const allMatchDiff: DiffSummary = {
    totalFields: 3,
    matching: 3,
    mismatching: 0,
    aOnly: 0,
    bOnly: 0,
    fields: [],
  };

  const mismatchDiff: DiffSummary = {
    totalFields: 3,
    matching: 1,
    mismatching: 2,
    aOnly: 0,
    bOnly: 0,
    fields: [],
  };

  it('returns consensus when all fields match', () => {
    const result = classifyDiff('case-1', 'classify', allMatchDiff, new Set());
    expect(result).toBe('consensus');
  });

  it('returns opus_wrong when there is a parse error', () => {
    const result = classifyDiff('case-1', 'classify', mismatchDiff, new Set(), 'Malformed JSON');
    expect(result).toBe('opus_wrong');
  });

  it('returns pro_wrong when Pro had known issues at this pair', () => {
    const proIssues = new Set(['case-1/classify']);
    const result = classifyDiff('case-1', 'classify', mismatchDiff, proIssues);
    expect(result).toBe('pro_wrong');
  });

  it('returns both_unsure when mismatch exists but no Pro issue and no parse error', () => {
    const result = classifyDiff('case-1', 'classify', mismatchDiff, new Set());
    expect(result).toBe('both_unsure');
  });

  it('opus_wrong takes priority over pro_wrong', () => {
    // Even if Pro had issues, if Sonnet returned a parse error, it's opus_wrong
    const proIssues = new Set(['case-1/classify']);
    const result = classifyDiff('case-1', 'classify', mismatchDiff, proIssues, 'Parse error');
    expect(result).toBe('opus_wrong');
  });
});

// ─── extractWithRetry ───────────────────────────────────────────────────────────

describe('extractWithRetry', () => {
  it('returns parsed JSON on successful response', async () => {
    const output = { items: [{ cargo: 'wheat' }] };
    callMock.mockResolvedValue(JSON.stringify(output));

    const result = await extractWithRetry(fakeCallAiText, 'system', 'user');

    expect(result.json).toEqual(output);
    expect(result.error).toBeUndefined();
  });

  it('returns parse error on malformed JSON from model', async () => {
    callMock.mockResolvedValue('This is not valid JSON at all');

    const result = await extractWithRetry(fakeCallAiText, 'system', 'user');

    expect(result.json).toBeNull();
    expect(result.error).toMatch(/Malformed JSON/);
  });

  it('retries on throttle errors with backoff', async () => {
    const throttleError = new Error('ThrottlingException: rate limit exceeded');
    const successResponse = JSON.stringify({ items: [] });

    callMock
      .mockRejectedValueOnce(throttleError)
      .mockResolvedValueOnce(successResponse);

    const result = await extractWithRetry(fakeCallAiText, 'system', 'user', 3);

    expect(result.json).toEqual({ items: [] });
    expect(callMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on non-throttle errors', async () => {
    const accessError = new Error('Access denied — invalid credentials');

    callMock.mockRejectedValue(accessError);

    const result = await extractWithRetry(fakeCallAiText, 'system', 'user', 3);

    expect(result.json).toBeNull();
    expect(result.error).toMatch(/Access denied/);
    expect(callMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after max retries on persistent throttle', async () => {
    const throttleError = new Error('429 Too Many Requests');

    callMock.mockRejectedValue(throttleError);

    // Use maxAttempts=2 to keep the test fast
    const result = await extractWithRetry(fakeCallAiText, 'system', 'user', 2);

    expect(result.json).toBeNull();
    expect(result.error).toMatch(/429/);
    expect(callMock).toHaveBeenCalledTimes(2);
  });

  it('strips fences from model output before parsing', async () => {
    callMock.mockResolvedValue('```json\n{"items": [{"vessel": "MV Test"}]}\n```');

    const result = await extractWithRetry(fakeCallAiText, 'system', 'user');

    expect(result.json).toEqual({ items: [{ vessel: 'MV Test' }] });
  });

  it('passes correct scope and model to callAiText', async () => {
    callMock.mockResolvedValue('{}');

    await extractWithRetry(fakeCallAiText, 'my-system-prompt', 'my-user-prompt');

    expect(callMock).toHaveBeenCalledTimes(1);
    const [scope, system, user, opts] = callMock.mock.calls[0];
    expect(scope).toBe('wave_gamma_ground_truth');
    expect(system).toBe('my-system-prompt');
    expect(user).toBe('my-user-prompt');
    expect(opts?.model).toBe('us.anthropic.claude-sonnet-4-6');
    expect(opts?.maxTokens).toBe(4096);
  });
});
