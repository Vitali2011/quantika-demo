# spec-betafix-14-csrf-draft-quote-client

**Plan:** beta-fixes | **Batch:** 3 | **Severity:** CRITICAL
**Source bug:** C2 (browser report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

Click "Draft Quote" на `/cargo/sample-01` → inline error "Invalid or missing CSRF token". `POST /api/ai/draft-quote` → HTTP 403.

Server-side в `app/api/ai/draft-quote/route.ts:13` уже корректно валидирует через `validateCsrf(request)`. **Проблема — на клиенте**: компонент Draft Quote button не шлёт CSRF token (header `X-CSRF-Token` или body field). Нужно использовать существующий fetch helper (как в parse-cargo flow).

## Files in scope

- Компонент(ы) рендерящие "Draft Quote" button (поиск нужен — likely `app/cargo/[id]/page.tsx` или `components/cargo/CargoActions.tsx`)
- Возможно `lib/csrf-client.ts` или `lib/api-client.ts` — fetch helper с CSRF auto-injection
- `__tests__/e2e/smoke/draft-quote.spec.ts` (новый)

## Files FORBIDDEN

- `app/api/ai/draft-quote/route.ts` (server OK)
- `lib/csrf.ts` (server-side, OK)

## Investigation

```bash
cd /Users/jarvis/work/quantika-demo
grep -rn "Draft Quote\|draft-quote\|/api/ai/draft-quote" app/ components/ 2>/dev/null
grep -rn "X-CSRF-Token\|csrfToken\|getCsrfToken" lib/ app/ components/ 2>/dev/null | head -20
```

Найти existing helper. Если есть — использовать; если нет — создать минимальный.

## TDD RED

```ts
// __tests__/e2e/smoke/draft-quote.spec.ts
test('Draft Quote button → 200 (no CSRF 403)', async ({ page }) => {
  await page.goto('/'); 
  // onboarding skip / sample data flow
  await page.goto('/cargo/sample-01');
  
  const responsePromise = page.waitForResponse(r => r.url().includes('/api/ai/draft-quote'));
  await page.click('text=Draft Quote');
  const response = await responsePromise;
  
  expect(response.status()).not.toBe(403);
  expect([200, 201, 422]).toContain(response.status()); // 422 ok если body invalid но не 403 CSRF
});

// Unit test для fetch helper
test('apiClient.post автоматически добавляет X-CSRF-Token header', async () => {
  document.cookie = 'csrf-token=test123';
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  
  await apiClient.post('/api/ai/draft-quote', { emailId: 'x' });
  
  const callArgs = fetchSpy.mock.calls[0];
  const headers = callArgs[1]?.headers as Record<string, string>;
  expect(headers['X-CSRF-Token']).toBe('test123');
});
```

## Fix sketch

```ts
// lib/api-client.ts (создать или extend)
export const apiClient = {
  async post(url: string, body: any) {
    const csrfToken = readCookie('csrf-token'); // или whatever cookie name
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken ?? '',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  },
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
```

И в Draft Quote компоненте:
```tsx
const handleDraft = async () => {
  const res = await apiClient.post('/api/ai/draft-quote', { emailId });
  // ...
};
```

## Acceptance criteria

- [ ] Click Draft Quote → не 403.
- [ ] CSRF cookie читается → header X-CSRF-Token шлётся.
- [ ] No CSRF cookie set (first visit) — graceful: либо инициализация cookie endpoint, либо понятный error не 403 (например "Please refresh the page").
- [ ] Existing fetch flows (parse-cargo, classify) не сломаны.

## Commit

`fix(βf-14-csrf-draft-quote-client): client отправляет X-CSRF-Token header для draft-quote`
