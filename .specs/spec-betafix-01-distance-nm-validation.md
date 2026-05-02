# spec-betafix-01-distance-nm-validation

**Plan:** beta-fixes | **Batch:** 1 | **Severity:** CRITICAL
**Source bug:** BUG-16 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`POST /api/voyage/tce` с `route.distanceNm: -100` возвращает HTTP 200 + расчёт где `bunker_usd=0`, `total_costs=0`, `daily_tce` либо 0 либо Infinity. Отрицательная дистанция физически невозможна — должен быть HTTP 400.

**Repro (curl против localhost:3000):**
```bash
curl -X POST http://localhost:3000/api/voyage/tce \
  -H 'Content-Type: application/json' \
  -d '{"vessel":{"dwt":30000,"bunkerMtPerDay":25},"route":{"distanceNm":-100,"speedKn":12,"loadPort":"NLRTM","dischargePort":"SGSIN"},"freightUsd":1500000}'
# Actual: 200 OK
# Expected: 400 Bad Request {error: ".../distanceNm must be > 0"}
```

## Files in scope

- `app/api/voyage/tce/route.ts` — Zod schema для `route.distanceNm` (только эта строка/блок).
- `app/api/voyage/tce/__tests__/route.test.ts` — RED тест (создать если не существует, иначе append; ≤30 expects).
- (если существует) `app/api/voyage/compare-routes/route.ts` — тот же fix для `legs[].distanceNm`.

## Files FORBIDDEN

- `lib/economics/voyage-calculator.ts` (другая спека)
- Любые файлы вне `app/api/voyage/`

## TDD RED

```ts
// app/api/voyage/tce/__tests__/route.test.ts
import { POST } from '../route';
import { NextRequest } from 'next/server';

it('rejects negative distanceNm with 400', async () => {
  const req = new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    body: JSON.stringify({
      vessel: { dwt: 30000, bunkerMtPerDay: 25 },
      route: { distanceNm: -100, speedKn: 12, loadPort: 'NLRTM', dischargePort: 'SGSIN' },
      freightUsd: 1500000,
    }),
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/distanceNm/i);
});

it('rejects distanceNm=0 with 400', async () => {
  // similar — distanceNm: 0 also invalid
});

it('accepts distanceNm=10500 (valid Antwerp→Singapore via Suez)', async () => {
  // smoke that valid request still returns 200
});
```

## Fix sketch

```ts
// route.ts (current Zod schema, find route.distanceNm field)
const RouteSchema = z.object({
  distanceNm: z.number().positive('distanceNm must be > 0'),
  // ... остальное без изменений
});
```

Если `compare-routes` route использует тот же или похожий schema — применить тот же `.positive()`.

## Acceptance criteria

- [ ] RED test fails before fix, passes after.
- [ ] `distanceNm: -100` → 400 + error message содержит "distanceNm".
- [ ] `distanceNm: 0` → 400.
- [ ] `distanceNm: 10500` → 200 (valid case).
- [ ] Существующие тесты `app/api/voyage/tce` не сломаны.
- [ ] `npm run lint` 0 errors.
- [ ] `npx tsc --noEmit` 0 errors в touched files.

## Commit

`fix(βf-01-distance-nm-validation): reject distanceNm <= 0 with 400`
