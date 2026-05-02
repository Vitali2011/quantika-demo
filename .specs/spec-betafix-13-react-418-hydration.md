# spec-betafix-13-react-418-hydration

**Plan:** beta-fixes | **Batch:** 3 | **Severity:** CRITICAL
**Source bug:** C1 (browser report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

5× `Error: Minified React error #418` (hydration mismatch) на любой navigation. Hotfix PR #38/#39 (`suppressHydrationWarning` + `serverExternalPackages` для better-sqlite3) — регрессировал или covered только subset компонентов.

## Files in scope

- TBD после диагностики (поиск компонентов с Date/Math.random/Date.now рендерами).
- Возможные usual suspects:
  - Greeting "Good morning, Broker" с временем
  - "Active until 2026-05-02T20:00:14.521Z" raw ISO timestamp
  - Voyage/cargo cards с relative time ("2h ago", "in 5 days")
  - WYWA card (если показывается) с динамическим content

## Files FORBIDDEN

- `next.config.ts` (если уже modified в hotfix — не перезаписывать; только дополнить если нужно)
- API routes (server-only — не источник #418)

## Investigation steps (do FIRST)

1. Запустить dev server: `cd /Users/jarvis/work/quantika-demo && npm run dev` (background).
2. Open browser → DevTools console; navigate `/` → `/dashboard` → `/cargo/sample-01` → back.
3. Когда #418 fires — full error в dev mode даст component name (NOT minified).
4. Альтернативно: search for патерны:
   ```bash
   grep -rn "new Date()\|Date.now()\|Math.random()\|toLocaleString\|toLocaleDateString" app/ components/ 2>/dev/null | grep -v "__tests__\|\.test\." | head -30
   ```
5. Особое внимание: components у которых server-render и client-render могут дать разный output (timezone, локаль, current time).

## TDD RED

E2E hydration check (Playwright):
```ts
// __tests__/e2e/smoke/hydration.spec.ts (или существующий smoke file)
test('no React #418 console errors on /dashboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('/');
  await page.goto('/dashboard');
  await page.goto('/cargo/sample-01');
  expect(errors.filter(e => e.includes('#418') || e.includes('Hydration'))).toHaveLength(0);
});
```

Если e2e harness слишком медленный — unit-render через `renderToString` + `hydrate` для подозрительного компонента и check'ать DOM equality.

## Fix sketch

Patterns:

### Pattern A: Time-based content
```tsx
'use client';
import { useEffect, useState } from 'react';
function GreetingTime() {
  const [time, setTime] = useState<Date | null>(null);
  useEffect(() => setTime(new Date()), []);
  if (!time) return <span>Good morning</span>; // SSR placeholder
  return <span>Good {timeOfDay(time)}</span>;
}
```

### Pattern B: Раннее placeholder + suppressHydrationWarning
```tsx
<time suppressHydrationWarning dateTime={iso}>{formatRelative(iso)}</time>
```

### Pattern C: Move Date computation to props (server-side only)
```tsx
// page.tsx (server component)
const now = new Date();
return <Greeting now={now.toISOString()} />;

// Greeting.tsx (client) — рендерит из prop, не вычисляет new Date()
```

## Acceptance criteria

- [ ] Browser console на `/`, `/dashboard`, `/onboarding`, `/cargo/<id>`, `/vessel/<id>` — 0 errors включая #418/hydration.
- [ ] Playwright e2e test проходит на 5+ routes.
- [ ] Visible timestamps по-прежнему функциональны (не пустые placeholders forever).

## Commit

`fix(βf-13-react-418-hydration): replace SSR-mismatch time/date renders с client-only mount pattern`
