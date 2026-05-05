import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { judge, type JudgeClient } from '../judge';

/**
 * Tests inject a fake `JudgeClient` directly rather than mocking
 * `@anthropic-ai/sdk` at the module boundary. The SDK ships ESM-only at
 * runtime (`./index.mjs` per its `exports` map) and Jest+ts-jest hoist of
 * `jest.mock` against ESM packages is unreliable, so we use constructor
 * injection — cleaner and decouples the judge from the SDK shape.
 */
const createMock = jest.fn() as jest.Mock<
  Promise<{ content: Array<{ type: string; text?: string }> }>,
  [unknown]
>;

const fakeClient: JudgeClient = {
  messages: {
    create: (args) => createMock(args),
  },
};

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
  createMock.mockReset();
});

describe('judge', () => {
  it('returns 5-tier verdict from Opus (Mode A with reference)', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(fixtureVerdict) }],
    });

    const v = await judge(
      {
        mode: 'A',
        systemPrompt: 'parse cargo',
        email: 'cargo from JEA to NSA',
        reference: { pol: 'AEJEA' },
        candidate: { pol: 'AEJEA' },
        candidateLabel: 'Candidate-A',
      },
      { client: fakeClient },
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
  });

  it('handles Mode B (no reference) — verdict still set, ref values null in diff', async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...fixtureVerdict,
            side_by_side_diff: [
              { field: 'pol', reference_value: null, candidate_value: 'AEJEA', match: true, comment: 'mode-b' },
            ],
            verdict: 'PASS_BETTER',
          }),
        },
      ],
    });

    const v = await judge(
      {
        mode: 'B',
        systemPrompt: 'parse cargo',
        email: 'cargo from JEA to NSA',
        reference: null,
        candidate: { pol: 'AEJEA' },
        candidateLabel: 'Candidate-A',
      },
      { client: fakeClient },
    );

    expect(v.verdict).toBeTruthy();
    expect(v.side_by_side_diff[0].reference_value).toBeNull();
  });

  it('strips ```json fences if Opus wraps the JSON', async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n' + JSON.stringify(fixtureVerdict) + '\n```',
        },
      ],
    });

    const v = await judge(
      {
        mode: 'A',
        systemPrompt: 'parse cargo',
        email: '...',
        reference: { pol: 'AEJEA' },
        candidate: { pol: 'AEJEA' },
        candidateLabel: 'Candidate-A',
      },
      { client: fakeClient },
    );

    expect(v.verdict).toBe('PASS_PARITY');
  });

  it('passes anonymous candidateLabel + judge prompt forbids speculation', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(fixtureVerdict) }],
    });

    await judge(
      {
        mode: 'A',
        systemPrompt: 'parse cargo',
        email: '...',
        reference: { pol: 'AEJEA' },
        candidate: { pol: 'AEJEA' },
        candidateLabel: 'Candidate-A',
      },
      { client: fakeClient },
    );

    const callArgs = createMock.mock.calls[0][0] as {
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(callArgs.system).toMatch(/Do NOT speculate which model produced it/i);
    expect(callArgs.messages[0].content).toContain('Candidate-A');
    // Should NOT leak any actual model id into the user message.
    expect(callArgs.messages[0].content).not.toMatch(/gemini|opus|sonnet|gpt-/i);
  });

  it('throws an informative error if the SDK returns garbage (parse failure)', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'this is not json at all, just prose' }],
    });

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
        { client: fakeClient },
      ),
    ).rejects.toThrow(/judge.*parse/i);
  });

  it('throws if SDK returns no text block', async () => {
    createMock.mockResolvedValue({ content: [] });

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
        { client: fakeClient },
      ),
    ).rejects.toThrow(/no text block/i);
  });
});
