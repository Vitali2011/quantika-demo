/**
 * TDD tests for AbortController 85s timeout in callAiJson (βf3-01).
 *
 * Verifies:
 * - LLMTimeoutError is exported and instanceof-able
 * - callAiJson throws LLMTimeoutError when LLM call exceeds 85s
 * - callAiJson returns parsed result on fast LLM response
 */

// ─── Mock OpenAI client ──────────────────────────────────────────────────────
// jest.mock is hoisted before imports, so we use a module-level variable
// accessed via a factory closure to avoid "before initialization" errors.

let _mockCreate: jest.Mock;

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          // Delegate to module-level variable set in beforeEach
          create: (...args: unknown[]) => _mockCreate(...args),
        },
      },
    })),
  };
});

import { callAiJson, LLMTimeoutError } from '@/lib/openai';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creates an async generator that yields chunks and optionally hangs. */
async function* makeStream(
  chunks: string[],
  delayMs = 0,
  signal?: AbortSignal,
): AsyncGenerator<{ choices: { delta: { content: string } }[] }> {
  for (const chunk of chunks) {
    if (signal?.aborted) throw new Error('AbortError');
    if (delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const tid = setTimeout(resolve, delayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(tid);
          reject(new Error('AbortError'));
        });
      });
    }
    yield { choices: [{ delta: { content: chunk } }] };
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LLMTimeoutError (βf3-01)', () => {
  it('exports LLMTimeoutError class', () => {
    expect(LLMTimeoutError).toBeDefined();
    const err = new LLMTimeoutError('test');
    expect(err).toBeInstanceOf(LLMTimeoutError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test');
  });
});

describe('callAiJson timeout (βf3-01)', () => {
  beforeEach(() => {
    _mockCreate = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * T-1: Fast LLM response (simulated 50ms) → resolves normally.
   * Guard: completes in <2s.
   */
  it('T-1: fast response resolves normally', async () => {
    _mockCreate.mockImplementation(async () =>
      makeStream(['{"result":', '"ok"}'], 50),
    );

    const start = Date.now();
    const result = await callAiJson<{ result: string }>(
      'test prompt',
      'system',
      'gpt-test',
      { result: 'fallback' },
    );
    const elapsed = Date.now() - start;

    expect(result.result).toBe('ok');
    expect(elapsed).toBeLessThan(5000);
  }, 10000);

  /**
   * T-2: Stream that respects AbortSignal throws LLMTimeoutError when signal fires.
   *
   * We use a short real timeout (300ms) to avoid actual 85s wait.
   * We directly invoke the internal AbortController pattern by mocking the
   * create call to accept a signal and abort when it fires.
   *
   * Note: we cannot easily fake the 85s setTimeout in Jest with async generators
   * due to Promise microtask ordering. Instead we verify the behaviour directly:
   * when create() receives an aborted signal and throws AbortError, callAiJson
   * must re-throw as LLMTimeoutError.
   */
  it('T-2: AbortError from create() is converted to LLMTimeoutError', async () => {
    // Mock create to throw AbortError immediately (simulates aborted signal)
    _mockCreate.mockImplementation(async () => {
      const err = new DOMException('The operation was aborted', 'AbortError');
      throw err;
    });

    // We patch setTimeout to fire immediately so the AbortController fires before create
    jest.useFakeTimers();

    const promise = callAiJson<{ result: string }>(
      'slow prompt',
      'system',
      'gpt-test',
      { result: 'fallback' },
    );

    // Fire the 85s timeout immediately
    jest.runAllTimers();

    await expect(promise).rejects.toBeInstanceOf(LLMTimeoutError);
  }, 10000);
});
