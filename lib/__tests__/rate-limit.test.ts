import { RateLimiter, aiRateLimiter } from '../rate-limit';

describe('RateLimiter', () => {
  it('first request is allowed with remaining = maxRequests - 1', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });
    const result = limiter.check('session-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
    expect(result.retryAfterMs).toBe(0);
  });

  it('20th request is allowed with remaining = 0', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });
    for (let i = 0; i < 19; i++) {
      limiter.check('session-1');
    }
    const result = limiter.check('session-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('21st request is rejected with retryAfterMs > 0', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });
    for (let i = 0; i < 20; i++) {
      limiter.check('session-1');
    }
    const result = limiter.check('session-1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('different keys are isolated from each other', () => {
    const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 3 });
    limiter.check('session-1');
    limiter.check('session-1');
    limiter.check('session-1');
    const blockedResult = limiter.check('session-1');
    expect(blockedResult.allowed).toBe(false);

    const session2Result = limiter.check('session-2');
    expect(session2Result.allowed).toBe(true);
    expect(session2Result.remaining).toBe(2);
  });

  it('counter resets after window expires', () => {
    jest.useFakeTimers();
    const limiter = new RateLimiter({ windowMs: 1_000, maxRequests: 3 });

    limiter.check('session-1');
    limiter.check('session-1');
    limiter.check('session-1');
    expect(limiter.check('session-1').allowed).toBe(false);

    jest.advanceTimersByTime(1_001);

    const result = limiter.check('session-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);

    jest.useRealTimers();
  });

  it('store size stays bounded under flood of unique keys (memory-DoS guard)', () => {
    // Without a cap, an attacker rotating fake IPs forever would grow the
    // internal Map unbounded → process OOM. The limiter must bound its store.
    const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 5, maxEntries: 100 });
    for (let i = 0; i < 1000; i++) {
      limiter.check(`unique-ip-${i}`);
    }
    expect(limiter.size()).toBeLessThanOrEqual(100);
  });

  it('gc removes stale keys', () => {
    jest.useFakeTimers();
    const limiter = new RateLimiter({ windowMs: 1_000, maxRequests: 5 });

    limiter.check('key-a');
    limiter.check('key-b');

    jest.advanceTimersByTime(1_001);
    limiter.gc();

    // After GC, both keys should be gone (no active timestamps)
    // Next check should start fresh
    const result = limiter.check('key-a');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);

    jest.useRealTimers();
  });
});

describe('aiRateLimiter singleton', () => {
  it('is an instance of RateLimiter with default params', () => {
    expect(aiRateLimiter).toBeDefined();
    const result = aiRateLimiter.check('singleton-test-key-' + Math.random());
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });
});
