/**
 * Returns the LLM timeout (in ms) that aligns with a given Vercel route
 * `maxDuration` (in seconds), leaving a 5-second buffer for response completion.
 *
 * Formula: `Math.max(5_000, (maxDuration - 5) * 1_000)`
 *
 * Examples:
 *   - maxDuration=30  → 25_000 ms  (draft-quote, draft-reply)
 *   - maxDuration=60  → 55_000 ms  (recap, parse-vessel)
 *   - maxDuration=120 → 115_000 ms (match, parse-recap, classify)
 *
 * The 5_000 ms floor prevents pathologically small (or negative) values when
 * `maxDuration` is very short (e.g. ≤ 10 s).
 *
 * @param maxDuration  Vercel `export const maxDuration` value (seconds).
 * @returns            LLM timeout in milliseconds.
 */
export function endpointLlmTimeout(maxDuration: number): number {
  return Math.max(5_000, (maxDuration - 5) * 1_000);
}
