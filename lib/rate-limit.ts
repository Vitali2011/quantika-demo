interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  maxEntries: number;
}

interface CheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxEntries: number;
  private readonly store: Map<string, number[]>;

  constructor({
    windowMs = 60_000,
    maxRequests = 20,
    maxEntries = 10_000,
  }: Partial<RateLimiterOptions> = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  check(key: string): CheckResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = (this.store.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      // Re-set so the touched key moves to most-recent in Map insertion order,
      // protecting actively-throttled attackers from being LRU-evicted before
      // their window expires.
      this.store.delete(key);
      this.store.set(key, timestamps);
      this.enforceCap();
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    timestamps.push(now);
    // delete-then-set keeps Map insertion order as a true LRU recency list.
    this.store.delete(key);
    this.store.set(key, timestamps);
    this.enforceCap();

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

  size(): number {
    return this.store.size;
  }

  // Bound memory under spoofed-IP floods: gc first (cheap when most are stale),
  // then evict oldest insertions until at cap. Map preserves insertion order,
  // and check() refreshes order on each touch, so this is effectively LRU.
  private enforceCap(): void {
    if (this.store.size <= this.maxEntries) return;
    this.gc();
    if (this.store.size <= this.maxEntries) return;
    const overflow = this.store.size - this.maxEntries;
    const it = this.store.keys();
    for (let i = 0; i < overflow; i++) {
      const next = it.next();
      if (next.done) break;
      this.store.delete(next.value);
    }
  }
}

export const aiRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });
export const parserEmailRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });
// 10 attempts per 15 min per IP — blocks credential brute-force on the demo login endpoint
export const loginRateLimiter = new RateLimiter({ windowMs: 15 * 60_000, maxRequests: 10 });
