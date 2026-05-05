/**
 * Helpers extracted from `app/api/ai/parse-cargo/route.ts`.
 *
 * Next.js 16 generates strict route-types that forbid non-route exports
 * from a `route.ts` file. These constants and helpers were previously
 * exported from the route for tests and other modules; that triggers
 * `TS2344` against `OmitWithTag<...>`. Moving them here keeps the public
 * surface intact while making the route file route-export-clean.
 *
 * Do NOT move generic `MAX_EMAIL_BODY_CHARS` here — the parse-cargo value
 * (12_000) intentionally differs from the email-fetch / classify preview
 * cap in `lib/constants.ts` (3_000). Keeping it in this dedicated module
 * preserves that scope distinction.
 */

// βf-11: Per-email body cap before we hand the prompt to the LLM. Real-inbox
// emails sometimes carry quoted threads/footers in the 50k–100k char range,
// which pushes the prompt over cliproxy/gpt-5.5 budgets and stalls the route.
// 12 000 chars ≈ 3 000 tokens — comfortably under the model's working window
// while still preserving the lead paragraph + first reply where intent lives.
export const MAX_EMAIL_BODY_CHARS = 12_000;

// βf-11: Per-email LLM timeout. We race callAiJson against this; on timeout we
// fall back to regex-only enrichment (applyCargoRateFallback / TypeFallback)
// so the route returns 200 with whatever we can salvage instead of stalling
// past maxDuration.
export const LLM_TIMEOUT_MS = 45_000;

/**
 * wave-γ-3 (B1): per-route concurrency cap on parallel LLM calls.
 * Was 3 — for a 13-email demo session that cost ~5 sequential rounds × 20s
 * each, hitting Cloudflare 524 stably. Bumped to 8 → ceil(13/8)=2 rounds.
 */
export const PARSE_CARGO_CONCURRENCY = 8;

/**
 * wave-γ-3 (B1): retry an LLM call when cliproxy returns 429 (rate limit).
 * Higher pLimit concurrency means more chance of brief upstream throttling;
 * a jittered backoff retry absorbs the blip without surfacing it as a parse
 * failure. Non-429 errors propagate immediately so real failures stay loud.
 */
export interface Retry429Options {
  maxRetries?: number;
  /** Alias for maxRetries (γ-cleanup-B). */
  maxAttempts?: number;
  baseDelayMs?: number;
}

export async function withRetry429<T>(
  fn: () => Promise<T>,
  opts: Retry429Options = {},
): Promise<T> {
  // maxAttempts is the total number of calls; maxRetries is retries after the first.
  // Support both: if maxAttempts is given, derive maxRetries from it.
  const maxRetries =
    opts.maxRetries ?? (opts.maxAttempts != null ? opts.maxAttempts - 1 : 2);
  const baseDelayMs = opts.baseDelayMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // γ-cleanup-B: check error.status / error.statusCode FIRST (authoritative).
      // Regex is a message-based fallback ONLY when status is not present — avoids
      // false-positive on e.g. "RFQ #429 not found" where 429 is an order ID,
      // not a rate-limit HTTP status code.
      const status =
        (err as { status?: number; statusCode?: number })?.status ??
        (err as { statusCode?: number })?.statusCode;
      const isStatusRateLimit = status === 429;
      const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
      // Message-based detection (fallback when status is absent).
      // Lookbehind (?<![#\w]) prevents false-positives like "RFQ #429 not found"
      // where 429 is an order ID preceded by '#', not an HTTP rate-limit code.
      const isMessageRateLimit = /(?<![#\w])429\b|rate[-_\s]?limit/i.test(msg);
      const isRateLimit = isStatusRateLimit || isMessageRateLimit;
      if (!isRateLimit || attempt === maxRetries) throw err;
      // Jittered exponential backoff: baseDelay × 2^attempt × (1..2 random).
      const delayMs = baseDelayMs * Math.pow(2, attempt) * (1 + Math.random());
      // γ-cleanup-B: .unref() lets jest worker exit cleanly (timer does not keep
      // the event loop alive when the test suite finishes).
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, delayMs);
        if (typeof t.unref === 'function') t.unref();
      });
    }
  }
  throw lastErr;
}
