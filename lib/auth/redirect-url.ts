import { NextRequest } from 'next/server';

/**
 * Build the external base URL used for server-issued redirects.
 *
 * L-1 hardening: the client-controlled `X-Forwarded-Host` header must NOT be
 * trusted by default — an attacker could set it to an arbitrary domain and turn
 * a login redirect into an open redirect / host-header poisoning vector.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL          — canonical server config (always preferred).
 *   2. X-Forwarded-{Host,Proto}     — only when TRUST_PROXY_HEADERS=true
 *                                     (explicit opt-in for the Caddy deployment,
 *                                      which strips/overwrites these headers).
 *   3. Host header                  — the value Next.js itself parsed.
 *   4. request.url                  — last resort.
 */
export function getRequestBaseUrl(request: NextRequest): string {
  // 1. Trusted server-side configuration wins outright.
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const trustProxy = process.env.TRUST_PROXY_HEADERS === 'true';

  // 2. Forwarded headers are only consulted behind a trusted proxy.
  const fwdHost = trustProxy ? request.headers.get('x-forwarded-host') : null;
  const fwdProto = trustProxy ? request.headers.get('x-forwarded-proto') : null;

  // 3. Otherwise rely on the Host header Next.js parsed for this request.
  const host = fwdHost ?? request.headers.get('host');

  if (host) {
    const proto = fwdProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  // 4. Last resort.
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
