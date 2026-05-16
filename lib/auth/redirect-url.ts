import { NextRequest } from 'next/server';

/**
 * Build the external base URL behind a reverse proxy (e.g. Caddy → localhost:3000).
 * Prefers X-Forwarded-{Proto,Host} → Host header → request.url as last resort.
 */
export function getRequestBaseUrl(request: NextRequest): string {
  const fwdHost = request.headers.get('x-forwarded-host');
  const fwdProto = request.headers.get('x-forwarded-proto');
  const host = fwdHost ?? request.headers.get('host');

  if (host) {
    const proto = fwdProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
