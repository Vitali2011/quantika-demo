import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { judge, JUDGE_MODEL, JUDGE_SCOPE, type CallAiTextFn } from '../judge';

/**
 * Tests inject a fake `callAiText` directly rather than mocking
 * `lib/ai-provider` at the module boundary. This mirrors the original
 * design choice (constructor injection over module mocks) and decouples
 * the judge tests from the Bedrock SDK shape.
 */
const callMock = jest.fn() as jest.Mock<Promise<string>, Parameters<CallAiTextFn>>;

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

    // Verify call shape: pinned to Opus 4.7 Bedrock model + judge scope.
    const [scope, , , opts] = callMock.mock.calls[0];
    expect(scope).toBe(JUDGE_SCOPE);
    expect(opts?.model).toBe(JUDGE_MODEL);
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
