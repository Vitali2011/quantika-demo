# spec-betafix-18-pipedrive-oauth-refresh

**Plan:** beta-fixes | **Batch:** 4 | **Severity:** HIGH
**Source bug:** BUG-β-02-OAuthRefreshMissingCreds (adversarial)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`lib/integrations/pipedrive/tokens.ts:189-196` — refresh POST к `/oauth/token` шлёт только `{grant_type, refresh_token}` без `client_id`/`client_secret`. Pipedrive (per spec β-02 lines 109-110) требует credentials. Refresh fails silently 401 → CRM sync broken.

## Files in scope

- `lib/integrations/pipedrive/tokens.ts` (refresh body)
- `lib/integrations/pipedrive/__tests__/tokens.test.ts`

## Files FORBIDDEN

- `lib/integrations/pipedrive/sync.ts` (другая логика).
- Прочее.

## TDD RED

```ts
import { getValidAccessToken } from '../tokens';

it('refresh шлёт client_id и client_secret в body', async () => {
  process.env.PIPEDRIVE_CLIENT_ID = 'cid_test';
  process.env.PIPEDRIVE_CLIENT_SECRET = 'csec_test';
  
  let capturedBody: string | undefined;
  global.fetch = jest.fn(async (url, opts) => {
    capturedBody = opts?.body as string;
    return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'newr', expires_in: 3600 }), { status: 200 });
  }) as any;
  
  // setup expired token in DB / store, then call:
  await getValidAccessToken('user-id-with-expired-token');
  
  expect(capturedBody).toContain('client_id=cid_test');
  expect(capturedBody).toContain('client_secret=csec_test');
  expect(capturedBody).toContain('grant_type=refresh_token');
});

it('missing PIPEDRIVE_CLIENT_ID — throws explicit error', async () => {
  delete process.env.PIPEDRIVE_CLIENT_ID;
  await expect(getValidAccessToken('user-id')).rejects.toThrow(/PIPEDRIVE_CLIENT_ID/);
});

it('refresh response 401 — surfaced to caller', async () => {
  global.fetch = jest.fn(async () => new Response('{"error":"invalid_client"}', { status: 401 })) as any;
  await expect(getValidAccessToken('user-id')).rejects.toThrow();
});
```

## Fix sketch

```ts
// lib/integrations/pipedrive/tokens.ts
async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.PIPEDRIVE_CLIENT_ID;
  const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PIPEDRIVE_CLIENT_ID and PIPEDRIVE_CLIENT_SECRET env vars required');
  }
  
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  
  const res = await fetch('https://oauth.pipedrive.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  
  if (!res.ok) throw new Error(`Pipedrive refresh failed: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}
```

## Acceptance criteria

- [ ] Refresh body содержит client_id, client_secret, grant_type, refresh_token.
- [ ] Missing env var → explicit error.
- [ ] Tests green.

## Commit

`fix(βf-18-pipedrive-oauth-refresh): include client_id+client_secret в OAuth refresh body`
