/**
 * wave-γ-3 Task B1: parse-cargo concurrency 3 → 8 + retry-on-429.
 *
 * Demo orchestration parses ~13 cargo emails per session. With pLimit(3)
 * each batch took ~5 sequential rounds × ~20s LLM = stable 524 timeouts
 * (Cloudflare 100s limit). Bumping to pLimit(8) collapses to ~2 rounds.
 * Retry-on-429 protects against cliproxy rate-limit blips during the
 * higher concurrency window.
 *
 * The two helpers under test live alongside the route so they can be
 * unit-tested without spinning up a Next request.
 */

import { withRetry429, PARSE_CARGO_CONCURRENCY } from '@/app/api/ai/parse-cargo/route';

describe('wave-γ-3 Task B1: parse-cargo concurrency limit', () => {
  it('exposes PARSE_CARGO_CONCURRENCY = 8 (was 3 — caused 524 with 13 demo emails)', () => {
    expect(PARSE_CARGO_CONCURRENCY).toBe(8);
  });
});

describe('wave-γ-3 Task B1: withRetry429 helper', () => {
  it('passes through on first success — no retry, no delay', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return 'ok';
    };
    const result = await withRetry429(fn);
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on a 429 status and resolves with the second-call value', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls === 1) {
        const err: Error & { status?: number } = new Error('Too Many Requests');
        err.status = 429;
        throw err;
      }
      return 'ok-after-retry';
    };
    const result = await withRetry429(fn, { maxRetries: 2, baseDelayMs: 1 });
    expect(result).toBe('ok-after-retry');
    expect(calls).toBe(2);
  });

  it('retries on a message containing "rate limit" / "429" even without status', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls === 1) throw new Error('cliproxy upstream returned 429 rate limited');
      return 'ok';
    };
    const result = await withRetry429(fn, { maxRetries: 1, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('non-429 errors propagate immediately (no retry)', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      throw new Error('boom — schema mismatch');
    };
    await expect(withRetry429(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow(/boom/);
    expect(calls).toBe(1);
  });

  it('exhausts retries and re-throws the last 429', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      const err: Error & { status?: number } = new Error('rate limited again');
      err.status = 429;
      throw err;
    };
    await expect(withRetry429(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow(/rate limited/);
    // 1 initial + 2 retries = 3 total attempts.
    expect(calls).toBe(3);
  });
});
