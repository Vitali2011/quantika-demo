import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * We mock `@google/genai` because the bake-off candidate runner calls Vertex AI
 * directly (rather than through `lib/ai-provider.ts`) so it can capture
 * `usageMetadata` — the shim's `callAiJson` only returns parsed T and writes
 * tokens to ai_audit (caller-invisible). For cost computation we need tokens
 * back at call site, hence direct SDK use here.
 */
const generateContent = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: (...args: unknown[]) => generateContent(...args) },
  })),
}));

// Set required env so assertGeminiEnv-style guards (if invoked) don't trip.
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '/tmp/fake.json';
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? 'test-project';

import { runCandidate, MODELS, computeCostForModel } from '../run-candidate';

describe('MODELS registry', () => {
  it('contains exactly 6 entries', () => {
    expect(MODELS).toHaveLength(6);
  });

  it('each entry has id + pricing per 1M tokens', () => {
    for (const m of MODELS) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.apiId).toBe('string');
      expect(typeof m.inputPerMTokens).toBe('number');
      expect(typeof m.outputPerMTokens).toBe('number');
      expect(m.inputPerMTokens).toBeGreaterThan(0);
      expect(m.outputPerMTokens).toBeGreaterThan(0);
    }
  });

  it('includes the 6 expected display ids from verification-plan', () => {
    const ids = MODELS.map((m) => m.id).sort();
    expect(ids).toEqual(
      [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-3.1-flash-lite-preview',
      ].sort(),
    );
  });
});

describe('computeCostForModel', () => {
  it('multiplies tokens by per-million pricing', () => {
    const cost = computeCostForModel(
      { inputPerMTokens: 1.0, outputPerMTokens: 2.0 } as never,
      1_000_000,
      500_000,
    );
    expect(cost).toBeCloseTo(1.0 + 1.0, 6);
  });
});

describe('runCandidate', () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it('returns parsed JSON, latency, tokens and cost', async () => {
    generateContent.mockResolvedValueOnce({
      text: '{"items":[{"foo":1}]}',
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    });

    const result = await runCandidate({
      model: MODELS.find((m) => m.id === 'gemini-2.5-flash')!,
      systemPrompt: 'you are a parser',
      userInput: 'parse this',
    });

    expect(result.modelError).toBeUndefined();
    expect(result.parseError).toBeUndefined();
    expect(result.outputText).toBe('{"items":[{"foo":1}]}');
    expect(result.outputJson).toEqual({ items: [{ foo: 1 }] });
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    // 0.30/M in + 2.50/M out → 100*0.30/1e6 + 50*2.50/1e6 = 0.00003 + 0.000125 = 0.000155
    expect(result.costUsd).toBeCloseTo(0.000155, 8);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('strips ```json fences when parsing', async () => {
    generateContent.mockResolvedValueOnce({
      text: '```json\n{"ok":true}\n```',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });

    const result = await runCandidate({
      model: MODELS[0],
      systemPrompt: 's',
      userInput: 'u',
    });
    expect(result.outputJson).toEqual({ ok: true });
    expect(result.parseError).toBeUndefined();
  });

  it('captures parseError when output is not valid JSON', async () => {
    generateContent.mockResolvedValueOnce({
      text: 'definitely not json',
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
    });

    const result = await runCandidate({
      model: MODELS[0],
      systemPrompt: 's',
      userInput: 'u',
    });
    expect(result.outputText).toBe('definitely not json');
    expect(result.outputJson).toBeNull();
    expect(result.parseError).toBeDefined();
    expect(result.modelError).toBeUndefined();
  });

  it('captures modelError on thrown exception with zero cost/tokens', async () => {
    generateContent.mockRejectedValueOnce(new Error('boom: api 500'));

    const result = await runCandidate({
      model: MODELS[0],
      systemPrompt: 's',
      userInput: 'u',
    });
    expect(result.modelError).toContain('boom');
    expect(result.outputText).toBe('');
    expect(result.outputJson).toBeNull();
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.costUsd).toBe(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('captures modelError on timeout', async () => {
    generateContent.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
    );

    const result = await runCandidate({
      model: MODELS[0],
      systemPrompt: 's',
      userInput: 'u',
      timeoutMs: 50,
    });
    expect(result.modelError).toMatch(/timeout/i);
    expect(result.inputTokens).toBe(0);
  });
});
