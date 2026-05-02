/**
 * Client-side CSRF helpers (browser only).
 *
 * Server uses double-submit cookie defence: a `csrf_token` cookie (httpOnly:false,
 * sameSite:strict) is set by `app/api/sample/route.ts` / `app/api/auth/google/route.ts`,
 * and mutating endpoints expect the same value echoed back as `X-CSRF-Token` header.
 *
 * `validateCsrf()` in `lib/csrf.ts` (Origin/Referer check) is the primary defence,
 * but several endpoints use `checkCsrfRequest()` which requires the header. Some
 * deployments / proxies strip the Origin header — in that case the header check
 * is the only remaining gate, so the client MUST send `X-CSRF-Token` for every
 * mutating fetch to be safe across environments.
 *
 * This helper centralises that logic so we don't repeat the cookie-parse in every
 * component (e.g. `app/processing/page.tsx` already does it inline).
 */

/**
 * Reads a cookie value by name from `document.cookie`.
 * Returns `null` in non-browser environments (SSR / tests without jsdom).
 */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  // Match `name=value` accounting for leading whitespace after `;`.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Returns the current CSRF token from the `csrf_token` cookie, or empty string
 * if not present. Empty string is a deliberate fallback: server will reject with
 * 403 (which surfaces a recoverable error), rather than the client throwing.
 */
export function getCsrfToken(): string {
  return readCookie('csrf_token') ?? '';
}

/**
 * `fetch` wrapper that automatically:
 *   - attaches `X-CSRF-Token` header from the `csrf_token` cookie,
 *   - sets `Content-Type: application/json` (unless caller overrides),
 *   - includes credentials so the cookie round-trips on same-origin POSTs.
 *
 * Use for any state-mutating client call. GETs don't need this.
 */
export async function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const csrfToken = getCsrfToken();
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  };
  // Caller-supplied headers win (e.g. multipart bodies overriding Content-Type).
  const mergedHeaders = { ...baseHeaders, ...(init.headers as Record<string, string> | undefined) };
  return fetch(input, {
    credentials: 'include',
    ...init,
    headers: mergedHeaders,
  });
}
