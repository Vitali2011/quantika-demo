import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { judge, JUDGE_SCOPE, isThrottle, callWithRetry, RETRY_DELAYS_MS, type CallAiTextFn } from '../judge';

/**
 * Tests inject a fake `callAiText` directly rather than mocking
 * `lib/ai-provider` at the module boundary. This mirrors the original
 * design choice (constructor injection over module mocks) and decouples
 * the judge tests from the Bedrock SDK shape.
 */
const callMock: jest.MockedFunction<CallAiTextFn> = jest.fn();

const fakeCallAiText: CallAiTextFn = (scope, system, user, opts) =>
  callMock(scope, system, user, opts);

const fixtureVerdict = {
  completeness: 92,
  accuracy: 88,
  format_validity: 1,
  issues: [],
  side_by_side_diff: [
    { field: 'pol', reference_value: 'AEJEA', candidate_value: 'AEJEA', match: true, comment: 'identical' },
  ],
  verdict: 'PASS_PARITY',
  rationale: 'Matches reference except minor whitespace.',
};

beforeEach(() => {
  callMock.mockReset();
});

describe('judge', () => {
  it('returns 5-tier verdict from Opus (Mode A with reference)', async () => {
    callMock.mockResolvedValue(JSON.stringify(fixtureVerdict));

    const v = await judge(
      {
        mode: 'A',
        systemPrompt: 'parse cargo',
        email: 'cargo from JEA to NSA',
        reference: { pol: 'AEJEA' },
        candidate: { pol: 'AEJEA' },
        candidateLabel: 'Candidate-A',
      },
      { callAiText: fakeCallAiText },
    );

    expect(['PASS_BETTER', 'PASS_PARITY', 'PASS_DEGRADED', 'PASS_MARGINAL', 'FAIL']).toContain(v.verdict);
    expect(v.completeness).toBeGreaterThanOrEqual(0);
    expect(v.completeness).toBeLessThanOrEqual(100);
    expect(v.accuracy).toBeGreaterThanOrEqual(0);
    expect(v.accuracy).toBeLessThanOrEqual(100);
    expect([0, 1]).toContain(v.format_validity);
    expect(Array.isArray(v.side_by_side_diff)).toBe(true);
    expect(Array.isArray(v.issues)).toBe(true);
    expect(typeof v.rationale).toBe('string');

    // Verify call shape: pinned to an Opus 4.7 Bedrock id + judge scope.
    const [scope, , , opts] = callMock.mock.calls[0];
    expect(scope).toBe(JUDGE_SCOPE);
    // Model resolves from env (BEDROCK_MODEL_ID / JUDGE_BEDROCK_MODEL) or the
    // hard-coded fallback alias — all are Opus 4.7 cross-region profiles.
    expect(opts?.model).toMatch(/claude-opus-4-7/);
    expect(opts?.maxTokens).toBe(2048);
  });

  it('handles Mode B (no reference) — verdict still set, ref values null in diff', async () => {
    callMock.mockResolvedValue(
      JSON.stringify({
        ...fixtureVerdict,
        side_by_side_diff: [
          { field: 'pol', reference_value: null, candidate_value: 'AEJEA', match: true, comment: 'mode-b' },
        ],
        verdict: 'PASS_BETTER',
      }),
    );

    const v = await judge(
      {
        mode: 'B',
        systemPrompt: 'parse cargo',
        email: 'cargo from JEA to NSA',
        reference: null,
        candidate: { pol: 'AEJEA' },
        candidateLabel: 'Candidate-A',
      },
      { callAiText: fakeCallAiText },
    );

    expect(v.verdict).toBeTruthy();
    expect(v.side_by_side_diff[0].reference_value).toBeNull();
  });

  it('strips ```json fences if Opus wraps the JSON', async () => {
    callMock.mockResolvedValue('```json\n' + JSON.stringify(fixtureVerdict) + '\n```');

    const v = await judge(
      {
        mode: 'A',
        systemPrompt: 'parse cargo',
        email: '...',
        reference: { pol: 'AEJEA' },
        candidate: { pol: 'AEJEA' },
        candidateLabel: 'Candidate-A',
      },
      { callAiText: fakeCallAiText },
    );

    expect(v.verdict).toBe('PASS_PARITY');
  });

  it('passes anonymous candidateLabel + judge prompt forbids speculation', async () => {
    callMock.mockResolvedValue(JSON.stringify(fixtureVerdict));

    await judge(
      {
        mode: 'A',
        systemPrompt: 'parse cargo',
        email: '...',
        reference: { pol: 'AEJEA' },
        candidate: { pol: 'AEJEA' },
        candidateLabel: 'Candidate-A',
      },
      { callAiText: fakeCallAiText },
    );

    const [, system, user] = callMock.mock.calls[0];
    expect(system).toMatch(/Do NOT speculate which model produced it/i);
    expect(user).toContain('Candidate-A');
    // Should NOT leak any actual model id into the user message.
    expect(user).not.toMatch(/gemini|opus|sonnet|gpt-/i);
  });

  it('throws an informative error if the SDK returns garbage (parse failure)', async () => {
    callMock.mockResolvedValue('this is not json at all, just prose');

    await expect(
      judge(
        {
          mode: 'A',
          systemPrompt: 'parse cargo',
          email: '...',
          reference: { pol: 'AEJEA' },
          candidate: { pol: 'AEJEA' },
          candidateLabel: 'Candidate-A',
        },
        { callAiText: fakeCallAiText },
      ),
    ).rejects.toThrow(/judge.*parse/i);
  });

  it('throws if shim returns empty text', async () => {
    callMock.mockResolvedValue('');

    await expect(
      judge(
        {
          mode: 'A',
          systemPrompt: 'parse cargo',
          email: '...',
          reference: null,
          candidate: { pol: 'AEJEA' },
          candidateLabel: 'Candidate-A',
        },
        { callAiText: fakeCallAiText },
      ),
    ).rejects.toThrow(/no text block/i);
  });
});

// ---------------------------------------------------------------------------
// Retry helper tests (callWithRetry + isThrottle)
// ---------------------------------------------------------------------------

describe('isThrottle', () => {
  it('returns true for 429 in message', () => {
    expect(isThrottle(new Error('HTTP 429: Too Many Requests'))).toBe(true);
  });
  it('returns true for ThrottlingException', () => {
    expect(isThrottle(new Error('ThrottlingException: rate exceeded'))).toBe(true);
  });
  it('returns true for "Too Many Requests" prose', () => {
    expect(isThrottle(new Error('Too Many Requests'))).toBe(true);
  });
  it('returns false for 500 errors', () => {
    expect(isThrottle(new Error('Internal Server Error 500'))).toBe(false);
  });
  it('returns false for auth errors', () => {
    expect(isThrottle(new Error('Unauthorized 401'))).toBe(false);
  });
});

describe('callWithRetry', () => {
  it('(a) resolves on attempt 2 after a 429 on attempt 1', async () => {
    // Fake sleep — records calls but resolves immediately.
    const sleepCalls: number[] = [];
    const fakeSleep = async (ms: number) => { sleepCalls.push(ms); };

    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('HTTP 429: Too Many Requests');
      return 'success';
    };

    const result = await callWithRetry(fn, fakeSleep);

    expect(result).toBe('success');
    expect(callCount).toBe(2);
    // One sleep between attempt 1 and attempt 2, matching RETRY_DELAYS_MS[0].
    expect(sleepCalls).toHaveLength(1);
    expect(sleepCalls[0]).toBe(RETRY_DELAYS_MS[0]);
  });

  it('(b) throws after 4 consecutive 429 errors (all delays exhausted)', async () => {
    const fakeSleep = async (_ms: number) => {};

    let callCount = 0;
    const throttleErr = new Error('ThrottlingException: capacity exceeded');
    const fn = async () => {
      callCount++;
      throw throttleErr;
    };

    await expect(callWithRetry(fn, fakeSleep)).rejects.toThrow('ThrottlingException: capacity exceeded');
    // RETRY_DELAYS_MS has 4 entries → 4 attempts total.
    expect(callCount).toBe(RETRY_DELAYS_MS.length);
  });

  it('(c) throws immediately on a 500 error without retrying', async () => {
    const sleepCalls: number[] = [];
    const fakeSleep = async (ms: number) => { sleepCalls.push(ms); };

    let callCount = 0;
    const serverErr = new Error('Internal Server Error 500');
    const fn = async () => {
      callCount++;
      throw serverErr;
    };

    await expect(callWithRetry(fn, fakeSleep)).rejects.toThrow('Internal Server Error 500');
    // Non-throttle → exactly 1 attempt, no sleep.
    expect(callCount).toBe(1);
    expect(sleepCalls).toHaveLength(0);
  });
});
