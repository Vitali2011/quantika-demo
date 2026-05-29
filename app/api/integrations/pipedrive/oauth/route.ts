/**
 * GET /api/integrations/pipedrive/oauth
 *
 * Two flows based on query params:
 *   ?action=init   → redirect to Pipedrive OAuth authorize page with CSRF state cookie
 *   ?code=...&state=... → callback: verify CSRF state, exchange code for tokens, save
 *
 * CSRF: state value stored in httpOnly cookie `pipedrive_oauth_state`.
 * On callback the query-param state must exactly match the cookie value.
 */

import { randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';
import { saveTokens } from '@/lib/integrations/pipedrive/tokens';
import type { PipedriveOAuthTokenResponse } from '@/lib/integrations/pipedrive/types';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pipedrive_oauth_state';
const DEFAULT_ACCOUNT_ID = 1; // single-tenant for now

// ---------------------------------------------------------------------------
// GET handler — init or callback
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // ── Init: redirect to Pipedrive OAuth ──────────────────────────────────────
  if (action === 'init' || (!code && !state)) {
    const clientId = process.env.PIPEDRIVE_CLIENT_ID;
    const redirectUri = process.env.PIPEDRIVE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return new Response(
        JSON.stringify({ error: 'PIPEDRIVE_CLIENT_ID or PIPEDRIVE_REDIRECT_URI not configured' }),
        { status: 500 }
      );
    }

    const csrfState = randomBytes(16).toString('hex');
    const authUrl = new URL('https://oauth.pipedrive.com/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', csrfState);

    // L-4: harden the CSRF-state cookie.
    // - Secure: never send the state over plaintext HTTP (skipped in dev so the
    //   localhost flow still works without TLS).
    // - Max-Age: bound the cookie's lifetime to the OAuth round-trip (10 min)
    //   instead of leaving a dangling session cookie.
    const isProduction = process.env.NODE_ENV === 'production';
    const stateCookie = [
      `${STATE_COOKIE}=${csrfState}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      'Max-Age=600',
      isProduction ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ');

    return new Response(null, {
      status: 302,
      headers: {
        location: authUrl.toString(),
        'set-cookie': stateCookie,
      },
    });
  }

  // ── Callback: verify state + exchange code ─────────────────────────────────
  if (code && state) {
    const cookieHeader = req.headers.get('cookie') ?? '';
    const cookieState = parseCookieValue(cookieHeader, STATE_COOKIE);

    if (!cookieState || cookieState !== state) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing CSRF state' }),
        { status: 400 }
      );
    }

    const clientId = process.env.PIPEDRIVE_CLIENT_ID;
    const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET;
    const redirectUri = process.env.PIPEDRIVE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return new Response(
        JSON.stringify({ error: 'Pipedrive OAuth env vars not configured' }),
        { status: 500 }
      );
    }

    const tokenRes = await fetch('https://oauth.pipedrive.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Token exchange failed' }),
        { status: 500 }
      );
    }

    const data = (await tokenRes.json()) as PipedriveOAuthTokenResponse;
    const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

    saveTokens(DEFAULT_ACCOUNT_ID, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      apiDomain: data.api_domain,
    });

    // Clear the state cookie and redirect to dashboard
    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: {
          'set-cookie': `${STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0`,
        },
      }
    );
  }

  return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k.trim() === name) return rest.join('=').trim();
  }
  return null;
}
