import { randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';

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
 * Validates CSRF using Origin/Referer header check (same-origin defence).
 * In development, always returns true.
 */
export function validateCsrf(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') return true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://demo.quantika.org';
  const allowedOrigins = new Set([appUrl, 'http://localhost:3000']);

  const origin = request.headers.get('origin');
  if (origin !== null) {
    return allowedOrigins.has(origin);
  }

  // Origin absent — fall back to Referer
  const referer = request.headers.get('referer');
  if (referer) {
    return referer.startsWith(appUrl);
  }

  return false;
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
