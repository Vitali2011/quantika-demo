/**
 * wave-γ-1 follow-up: adversarial QA on PR #54 found 3 sibling LLM callers
 * that were not wired through the new timeout/graceful pattern:
 *
 *   - lib/economics/route-decision.ts:230 (llmReason in compareRoutes)
 *   - lib/whatsapp/forward-parser.ts:158
 *   - lib/imo/cii-lookup.ts:52
 *
 * These tests pin down the contract per call site so the same fail-OPEN
 * resource leak doesn't regrow elsewhere (Class 11 sibling endpoint check
 * from skill audit 2026-05-03).
 */

import { LLMTimeoutError } from '@/lib/openai';

jest.mock('@/lib/openai', () => {
  // Real LLMTimeoutError so instanceof checks work.
  const ActualErr = jest.requireActual('@/lib/openai').LLMTimeoutError;
  return {
    LLMTimeoutError: ActualErr,
    callAiText: jest.fn(),
    callAiJson: jest.fn(),
  };
});

import { callAiText, callAiJson } from '@/lib/openai';

const mockText = callAiText as jest.MockedFunction<typeof callAiText>;
const mockJson = callAiJson as jest.MockedFunction<typeof callAiJson>;

beforeEach(() => {
  mockText.mockReset();
  mockJson.mockReset();
});

describe('route-decision.llmReason — bounded LLM timeout', () => {
  it('passes a timeoutMs ≤ LLM_REASON_TIMEOUT_MS (4000) so internal abort fires within the race window', async () => {
    // Arrange: callAiText resolves with a usable string.
    mockText.mockResolvedValue('OK');

    const mod = await import('@/lib/economics/route-decision');
    // Probe via the public compareRoutes — sufficient to assert the LLM
    // wrapper was called with a bounded timeoutMs.
    await mod.compareRoutes(
      'singapore',
      'rotterdam',
      { dwt: 80000, ladenSpeed: 14, ballastSpeed: 14 } as any,
      { quantityMt: 70000, type: 'grain' } as any,
      { bunkerPriceUsdPerMt: 600, euaPriceEur: 70 },
    );

    // Assert: callAiText invoked with options.timeoutMs <= 4000.
    expect(mockText).toHaveBeenCalled();
    const lastCall = mockText.mock.calls[mockText.mock.calls.length - 1];
    const options = lastCall[lastCall.length - 1] as
      | { timeoutMs?: number; signal?: AbortSignal }
      | undefined;
    expect(options).toBeDefined();
    expect(options!.timeoutMs).toBeDefined();
    expect(options!.timeoutMs!).toBeLessThanOrEqual(4000);
  });

  it('LLMTimeoutError from callAiText resolves to template fallback (no propagation)', async () => {
    mockText.mockRejectedValue(new LLMTimeoutError('AI call timed out after 4s'));

    const mod = await import('@/lib/economics/route-decision');
    const result = await mod.compareRoutes(
      'singapore',
      'rotterdam',
      { dwt: 80000, ladenSpeed: 14, ballastSpeed: 14 } as any,
      { quantityMt: 70000, type: 'grain' } as any,
      { bunkerPriceUsdPerMt: 600, euaPriceEur: 70 },
    );

    // Result should still come back with a recommendation.reason string (template fallback).
    expect(typeof result.recommendation.reason).toBe('string');
    expect(result.recommendation.reason.length).toBeGreaterThan(0);
  });
});

describe('forward-parser — bounded timeout + graceful labelled timeout', () => {
  it('invokes callAiJson with a bounded timeoutMs (≤ 30s) for inbound WhatsApp parsing', async () => {
    mockJson.mockResolvedValue({ missing_info: [] } as any);

    const mod = await import('@/lib/whatsapp/forward-parser');
    const fakeClient = { downloadMedia: jest.fn() } as any;
    await mod.parseForwardedMessage(
      {
        id: 'wamid.x',
        from: '+10000000000',
        timestamp: '1714000000',
        type: 'text',
        text: { body: 'cargo wheat 50kt aug from istanbul to lagos' },
      } as any,
      fakeClient,
    );

    expect(mockJson).toHaveBeenCalled();
    const lastCall = mockJson.mock.calls[mockJson.mock.calls.length - 1];
    const options = lastCall[lastCall.length - 1] as
      | { timeoutMs?: number; signal?: AbortSignal }
      | undefined;
    expect(options).toBeDefined();
    expect(options!.timeoutMs).toBeDefined();
    expect(options!.timeoutMs!).toBeLessThanOrEqual(30_000);
  });

  it('LLMTimeoutError surfaces as confidence:missing with a labelled missingFields entry (not silent ai_extraction_failed)', async () => {
    mockJson.mockRejectedValue(new LLMTimeoutError('AI call timed out after 30s'));

    const mod = await import('@/lib/whatsapp/forward-parser');
    const fakeClient = { downloadMedia: jest.fn() } as any;
    const result = await mod.parseForwardedMessage(
      {
        id: 'wamid.t',
        from: '+10000000000',
        timestamp: '1714000000',
        type: 'text',
        text: { body: 'cargo wheat 50kt' },
      } as any,
      fakeClient,
    );

    expect(result.confidence).toBe('missing');
    expect(result.missingFields.some((f) => /timeout/i.test(f))).toBe(true);
  });
});

describe('cii-lookup — bounded timeout for unbounded admin LLM call', () => {
  it('passes a bounded timeoutMs (≤ 30s) to callAiJson', async () => {
    mockJson.mockResolvedValue({ rating: 'C' } as any);

    // cii-lookup imports callAiJson dynamically inside the function — the
    // import resolves to the mocked module thanks to jest.mock above.
    const mod = await import('@/lib/imo/cii-lookup');
    // Use a unique IMO that will not hit cache or static dataset to guarantee
    // the LLM fallback path executes.
    const uniqueImo = `9${Date.now().toString().slice(-6)}`;
    await mod.lookupCii(uniqueImo, { cacheDir: '/tmp/__cii_test_cache__' + Date.now() });

    expect(mockJson).toHaveBeenCalled();
    const lastCall = mockJson.mock.calls[mockJson.mock.calls.length - 1];
    const options = lastCall[lastCall.length - 1] as
      | { timeoutMs?: number; signal?: AbortSignal }
      | undefined;
    expect(options).toBeDefined();
    expect(options!.timeoutMs).toBeDefined();
    expect(options!.timeoutMs!).toBeLessThanOrEqual(30_000);
  });
});
