/**
 * Tests for judge-parse-cargo resilience layer.
 *
 * Covers 9-class boundary applied to the judge retry/fallback policy:
 *   Class 1 (empty)        — empty Bedrock response → retry
 *   Class 4 (range)        — exhausted attempts → conservative non-match
 *   Class 5 (switch)       — error classification per error kind
 *   Class 6 (substring)    — regex matches "unable to process" but not unrelated tokens
 *   Class 7 (config)       — ANTHROPIC_API_KEY missing vs present switches fallback
 *   Class 9 (E2E property) — returned object is a valid {equiv, reason} verdict
 *
 * PI3: these are NEW tests for NEW behavior — no existing test expectations
 * are rewritten.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import {
  classifyJudgeError,
  computeBackoffMs,
  executeJudgeWithResilience,
  type JudgePrimaryCall,
  type JudgeFallbackCall,
  type JudgeResilienceOpts,
} from '@/scripts/progonq/judge-parse-cargo';

// ─────────────────────────────────────────────────────────────────────────────
// classifyJudgeError — Class 5 (switch/dispatch) + Class 6 (substring leak)
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyJudgeError', () => {
  it('classifies rate-limit phrases as rate_limit', () => {
    expect(classifyJudgeError('Too many requests, please wait before trying again')).toBe('rate_limit');
    expect(classifyJudgeError('ThrottlingException: rate exceeded')).toBe('rate_limit');
    expect(classifyJudgeError('HTTP 429 Too Many Requests')).toBe('rate_limit');
  });

  it('classifies "Bedrock unable to process your request" as transient', () => {
    expect(classifyJudgeError('Bedrock unable to process your request')).toBe('transient');
    expect(classifyJudgeError('The model is unable to process your request at this time')).toBe('transient');
  });

  it('classifies 5xx and service-unavailable as service_unavailable', () => {
    expect(classifyJudgeError('HTTP 503 Service Unavailable')).toBe('service_unavailable');
    expect(classifyJudgeError('500 Internal Server Error')).toBe('service_unavailable');
    expect(classifyJudgeError('Service is temporarily unavailable')).toBe('service_unavailable');
  });

  it('classifies network timeouts as transient', () => {
    expect(classifyJudgeError('Request aborted: timeout after 30000ms')).toBe('transient');
    expect(classifyJudgeError('ETIMEDOUT')).toBe('transient');
    expect(classifyJudgeError('socket hang up')).toBe('transient');
  });

  it('classifies empty/malformed parse errors', () => {
    expect(classifyJudgeError('extractJson: empty input after trim')).toBe('empty');
    expect(classifyJudgeError('Unexpected token \'I\', "I\'ll syste"...')).toBe('malformed');
    expect(classifyJudgeError('equiv not boolean')).toBe('malformed');
  });

  it('classifies auth and validation errors as non_retryable', () => {
    expect(classifyJudgeError('AccessDeniedException: not authorized')).toBe('non_retryable');
    expect(classifyJudgeError('InvalidSignatureException')).toBe('non_retryable');
    expect(classifyJudgeError('ValidationException: model not supported')).toBe('non_retryable');
  });

  it('does NOT misclassify benign substrings (Class 6 substring leak)', () => {
    expect(classifyJudgeError('Capability assessment failed')).toBe('non_retryable');
    expect(classifyJudgeError('Unable to deserialize foo')).toBe('non_retryable');
  });

  it('defaults unknown errors to non_retryable', () => {
    expect(classifyJudgeError('Some weird new failure mode')).toBe('non_retryable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeBackoffMs — exponential 1s → 2s → 4s → 8s, cap 30s
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBackoffMs', () => {
  it('returns exponential delays starting at base 1000ms', () => {
    expect(computeBackoffMs(1, { baseMs: 1000, capMs: 30_000 })).toBe(1000);
    expect(computeBackoffMs(2, { baseMs: 1000, capMs: 30_000 })).toBe(2000);
    expect(computeBackoffMs(3, { baseMs: 1000, capMs: 30_000 })).toBe(4000);
    expect(computeBackoffMs(4, { baseMs: 1000, capMs: 30_000 })).toBe(8000);
  });

  it('caps at capMs', () => {
    expect(computeBackoffMs(10, { baseMs: 1000, capMs: 30_000 })).toBe(30_000);
    expect(computeBackoffMs(20, { baseMs: 1000, capMs: 30_000 })).toBe(30_000);
  });

  it('rate-limit kind doubles base (slower retry on throttle)', () => {
    expect(computeBackoffMs(1, { baseMs: 1000, capMs: 30_000, kind: 'rate_limit' })).toBe(2000);
    expect(computeBackoffMs(2, { baseMs: 1000, capMs: 30_000, kind: 'rate_limit' })).toBe(4000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// executeJudgeWithResilience — retry + backoff + fallback policy
// ─────────────────────────────────────────────────────────────────────────────

function makeOpts(overrides: Partial<JudgeResilienceOpts> = {}): JudgeResilienceOpts {
  return {
    maxAttempts: 4,
    backoff: { baseMs: 1, capMs: 10 }, // tiny — keep tests fast
    ...overrides,
  };
}

describe('executeJudgeWithResilience', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns parsed verdict on first success', async () => {
    const primary = jest.fn(async () => '{"equiv": true, "reason": "ok"}') as JudgePrimaryCall;

    const r = await executeJudgeWithResilience(primary, undefined, makeOpts());

    expect(r).toEqual({ equiv: true, reason: 'ok' });
    expect(primary).toHaveBeenCalledTimes(1);
  });

  it('strips ```json fences before parsing', async () => {
    const primary = jest.fn(async () => '```json\n{"equiv": false, "reason": "diff"}\n```') as JudgePrimaryCall;
    const r = await executeJudgeWithResilience(primary, undefined, makeOpts());
    expect(r.equiv).toBe(false);
    expect(r.reason).toBe('diff');
  });

  it('retries on "unable to process" (transient) — was previously not retried', async () => {
    let n = 0;
    const primary = jest.fn(async () => {
      n++;
      if (n < 3) throw new Error('Bedrock unable to process your request');
      return '{"equiv": true, "reason": "retry-recovered"}';
    }) as JudgePrimaryCall;

    const r = await executeJudgeWithResilience(primary, undefined, makeOpts());

    expect(primary).toHaveBeenCalledTimes(3);
    expect(r.equiv).toBe(true);
    expect(r.reason).toBe('retry-recovered');
  });

  it('retries on rate-limit', async () => {
    let n = 0;
    const primary = jest.fn(async () => {
      n++;
      if (n < 2) throw new Error('Too many requests, please wait before trying again');
      return '{"equiv": false, "reason": "ok"}';
    }) as JudgePrimaryCall;

    await executeJudgeWithResilience(primary, undefined, makeOpts());
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('retries on empty Bedrock response (Class 1)', async () => {
    let n = 0;
    const primary = jest.fn(async () => {
      n++;
      if (n < 2) return ''; // empty body
      return '{"equiv": true, "reason": "ok"}';
    }) as JudgePrimaryCall;

    await executeJudgeWithResilience(primary, undefined, makeOpts());
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on non_retryable errors (fast-fail)', async () => {
    const primary = jest.fn(async () => {
      throw new Error('AccessDeniedException: not authorized');
    }) as JudgePrimaryCall;

    const r = await executeJudgeWithResilience(primary, undefined, makeOpts());

    expect(primary).toHaveBeenCalledTimes(1);
    expect(r.equiv).toBe(false);
    expect(r.reason).toMatch(/conservative non-match/i);
  });

  it('exhausts attempts and returns conservative non-match (Class 4)', async () => {
    const primary = jest.fn(async () => {
      throw new Error('Bedrock unable to process your request');
    }) as JudgePrimaryCall;

    const r = await executeJudgeWithResilience(primary, undefined, makeOpts({ maxAttempts: 3 }));

    expect(primary).toHaveBeenCalledTimes(3);
    expect(r.equiv).toBe(false);
    expect(r.reason).toMatch(/conservative non-match/i);
  });

  it('uses Anthropic fallback after primary exhausts retries (Class 7: config)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    const primary = jest.fn(async () => {
      throw new Error('Bedrock unable to process your request');
    }) as JudgePrimaryCall;
    const fallback = jest.fn(async () => '{"equiv": true, "reason": "via-anthropic"}') as JudgeFallbackCall;

    const r = await executeJudgeWithResilience(primary, fallback, makeOpts({ maxAttempts: 3 }));

    expect(primary).toHaveBeenCalledTimes(3);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(r.equiv).toBe(true);
    expect(r.reason).toBe('via-anthropic');
  });

  it('does NOT call fallback when ANTHROPIC_API_KEY missing (Class 7: config)', async () => {
    // env was cleared in beforeEach
    const primary = jest.fn(async () => {
      throw new Error('Bedrock unable to process your request');
    }) as JudgePrimaryCall;
    const fallback = jest.fn(async () => '{"equiv": true, "reason": "should-not-fire"}') as JudgeFallbackCall;

    const r = await executeJudgeWithResilience(primary, fallback, makeOpts({ maxAttempts: 3 }));

    expect(fallback).not.toHaveBeenCalled();
    expect(r.reason).toMatch(/conservative non-match/i);
  });

  it('falls back to conservative when fallback itself fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    const primary = jest.fn(async () => {
      throw new Error('Bedrock unable to process your request');
    }) as JudgePrimaryCall;
    const fallback = jest.fn(async () => {
      throw new Error('Anthropic API: 503 service unavailable');
    }) as JudgeFallbackCall;

    const r = await executeJudgeWithResilience(primary, fallback, makeOpts({ maxAttempts: 2 }));

    expect(fallback).toHaveBeenCalledTimes(1);
    expect(r.equiv).toBe(false);
    expect(r.reason).toMatch(/conservative non-match/i);
  });

  it('returned object is always a valid JudgeVerdict (Class 9: E2E property)', async () => {
    const primary = jest.fn(async () => 'garbage not json') as JudgePrimaryCall;
    const r = await executeJudgeWithResilience(primary, undefined, makeOpts({ maxAttempts: 2 }));

    expect(typeof r.equiv).toBe('boolean');
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('treats malformed JSON as retryable and recovers on next attempt', async () => {
    let n = 0;
    const primary = jest.fn(async () => {
      n++;
      if (n === 1) return 'I will analyse this carefully...';
      return '{"equiv": true, "reason": "recovered"}';
    }) as JudgePrimaryCall;

    const r = await executeJudgeWithResilience(primary, undefined, makeOpts());

    expect(primary).toHaveBeenCalledTimes(2);
    expect(r.equiv).toBe(true);
  });
});
