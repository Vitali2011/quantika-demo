import { NextRequest } from 'next/server';

/**
 * Build the external base URL used for server-issued redirects.
 *
 * Fail-closed (BUG-3): a non-local Host header that arrives without trusted
 * configuration (NEXT_PUBLIC_APP_URL) or a trusted proxy (TRUST_PROXY_HEADERS)
 * is client-controlled and MUST NOT be echoed into a redirect base — doing so
 * enables open-redirect / host-header poisoning.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL          — canonical server config (always preferred).
 *   2. X-Forwarded-{Host,Proto}     — only when TRUST_PROXY_HEADERS=true
 *                                     (explicit opt-in for the Caddy deployment).
 *   3. Host header                  — honoured ONLY if it came from a trusted
 *                                     proxy (fwdHost set) OR is genuine localhost /
 *                                     127.0.0.1. Exact match only — localhost.evil.com
 *                                     and 127.0.0.1.evil.com are NOT local.
 *   4. Untrusted non-local Host     — safe default https://demo.quantika.org
 *   5. request.url                  — last resort when Host header absent.
 */

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h.startsWith('localhost:')
    || h === '127.0.0.1' || h.startsWith('127.0.0.1:');
}

export function getRequestBaseUrl(request: NextRequest): string {
  // 1. Trusted server-side configuration wins outright.
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const trustProxy = process.env.TRUST_PROXY_HEADERS === 'true';
  // 2. Forwarded headers only behind an explicitly trusted proxy.
  const fwdHost = trustProxy ? request.headers.get('x-forwarded-host') : null;
  const fwdProto = trustProxy ? request.headers.get('x-forwarded-proto') : null;
  const host = fwdHost ?? request.headers.get('host');

  if (host) {
    const local = isLocalHost(host);
    // BUG-3 fail-closed: a non-local Host header is client-controlled. Echoing it
    // into a redirect base without trusted config (NEXT_PUBLIC_APP_URL) or a trusted
    // proxy (TRUST_PROXY_HEADERS=true → fwdHost set) is an open-redirect /
    // host-header-poisoning vector.
    if (fwdHost || local) {
      const proto = fwdProto ?? (local ? 'http' : 'https');
      return `${proto}://${host}`;
    }
    // Untrusted, non-local Host → safe default (mirrors lib/csrf.ts fallback).
    return 'https://demo.quantika.org';
  }

  // 3. Last resort.
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
