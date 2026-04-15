import { randomBytes } from 'node:crypto';

const TOKEN_REGEX = /^[0-9a-f]{64}$/;

/**
 * Generates a cryptographically secure CSRF token (64-char hex, 32 bytes).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validates that a token has the correct format (64-char lowercase hex string).
 */
export function validateCsrfToken(token: unknown): boolean {
  if (typeof token !== 'string' || !token) return false;
  return TOKEN_REGEX.test(token);
}

/**
 * Minimal interface for CSRF request checking (compatible with NextRequest).
 */
export interface CsrfCheckable {
  cookies: { get(name: string): { value: string } | undefined };
  headers: { get(name: string): string | null };
}

/**
 * Validates CSRF for a request using the double-submit cookie pattern.
 * The X-CSRF-Token header must match the csrf_token cookie value.
 */
export function checkCsrfRequest(request: CsrfCheckable): boolean {
  const cookieToken = request.cookies.get('csrf_token')?.value;
  const headerToken = request.headers.get('X-CSRF-Token');
  if (!cookieToken || !headerToken) return false;
  if (!validateCsrfToken(cookieToken) || !validateCsrfToken(headerToken)) return false;
  return cookieToken === headerToken;
}
