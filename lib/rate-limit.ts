interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

interface CheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly store: Map<string, number[]>;

  constructor({ windowMs = 60_000, maxRequests = 20 }: Partial<RateLimiterOptions> = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.store = new Map();
  }

  check(key: string): CheckResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = (this.store.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    timestamps.push(now);
    this.store.set(key, timestamps);

    const remaining = this.maxRequests - timestamps.length;
    return { allowed: true, remaining, retryAfterMs: 0 };
  }

  gc(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of Array.from(this.store)) {
      const active = timestamps.filter((t: number) => t > windowStart);
      if (active.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, active);
      }
    }
  }
}

export const aiRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });
export const parserEmailRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });

// M-1: brute-force protection on POST /api/auth/login. Stricter than the AI
// limiter — a real user logs in a handful of times per minute, an attacker
// hammers it. 5 attempts / 60s per IP.
export const loginRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 5 });

// L-3: throttle credential-guessing against /api/admin/* shared-secret endpoints.
// Admin tooling is low-frequency; cap at 10 attempts / 60s per IP.
export const adminRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 });
