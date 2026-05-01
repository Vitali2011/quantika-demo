# spec-betafix-07-vessel-imo-endpoint

**Plan:** beta-fixes | **Batch:** 2 | **Severity:** CRITICAL
**Source bug:** BUG-08 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`GET /api/vessel/9322180` → HTTP 404. Endpoint не существует. CII-based vessel screening fully broken через API. Wave β spec включал CII rating display, но без endpoint'а нельзя fetch'ить.

## Files in scope

- `app/api/vessel/[imo]/route.ts` (создать)
- `app/api/vessel/[imo]/__tests__/route.test.ts`
- (опционально) `lib/vessel/registry.ts` или `lib/vessel/lookup.ts` — adapter поверх `lib/sample-data` или существующего vessel store

## Files FORBIDDEN

- Существующие vessel sample-data files (read-only).
- `lib/ais/datalastic.ts` (другая спека).

## Investigation

Где живут vessel data в проекте?
```bash
grep -rn "imo\|IMO" lib/sample-data/ lib/vessel/ 2>/dev/null | head -20
ls lib/sample-data/ | grep -i vessel
```

Если есть `lib/sample-data/vessels.json` или `lib/vessel/registry.ts` — использовать.

CII rating источник: либо в sample-data, либо вычислить через `lib/cii/calculator.ts` (если есть).

## TDD RED

```ts
import { GET } from '../route';

it('GET /api/vessel/9322180 → 200 + JSON с CII rating', async () => {
  const req = new NextRequest('http://localhost/api/vessel/9322180');
  const res = await GET(req, { params: Promise.resolve({ imo: '9322180' }) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.imo).toBe('9322180');
  expect(['A', 'B', 'C', 'D', 'E']).toContain(body.cii_rating);
  expect(typeof body.name).toBe('string');
});

it('Unknown IMO → 404', async () => {
  const res = await GET(makeReq('/api/vessel/0000001'), { params: Promise.resolve({ imo: '0000001' }) });
  expect(res.status).toBe(404);
});

it('Invalid IMO format (non-7-digit) → 400', async () => {
  const res = await GET(makeReq('/api/vessel/abc'), { params: Promise.resolve({ imo: 'abc' }) });
  expect(res.status).toBe(400);
});

it('Vessel с CII Grade D — chartering_policy_reject true', async () => {
  // sample-20 MV CARBON LADY
  const res = await GET(makeReq('/api/vessel/<imo of sample-20>'), { params: ... });
  const body = await res.json();
  if (body.cii_rating === 'D' || body.cii_rating === 'E') {
    expect(body.chartering_policy_reject).toBe(true);
  }
});
```

## Fix sketch

```ts
// app/api/vessel/[imo]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupVesselByImo } from '@/lib/vessel/registry'; // create or use existing

const ImoSchema = z.string().regex(/^\d{7}$/, 'IMO must be 7 digits');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imo: string }> }
) {
  const { imo } = await params;
  const parsed = ImoSchema.safeParse(imo);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid IMO' }, { status: 400 });

  const vessel = await lookupVesselByImo(imo);
  if (!vessel) return NextResponse.json({ error: 'Vessel not found' }, { status: 404 });

  return NextResponse.json({
    imo: vessel.imo,
    name: vessel.name,
    type: vessel.type,
    dwt: vessel.dwt,
    flag: vessel.flag,
    built_year: vessel.builtYear,
    cii_rating: vessel.ciiRating ?? null,
    chartering_policy_reject: vessel.ciiRating === 'D' || vessel.ciiRating === 'E',
    last_position: vessel.lastPosition ?? null,
  });
}
```

`lib/vessel/registry.ts`:
```ts
import { sampleVessels } from '@/lib/sample-data/vessels'; // или wherever
export async function lookupVesselByImo(imo: string) {
  return sampleVessels.find(v => v.imo === imo) ?? null;
}
```

## Acceptance criteria

- [ ] Existing IMO (sample-13 CARPATHIAN STAR, sample-20 CARBON LADY) → 200 + полный JSON.
- [ ] Unknown IMO → 404.
- [ ] Invalid format → 400.
- [ ] CII Grade D/E → `chartering_policy_reject:true`.
- [ ] CII Grade A/B/C → `chartering_policy_reject:false`.
- [ ] Tests green.

## Commit

`feat(βf-07-vessel-imo-endpoint): GET /api/vessel/[imo] with CII rating`

⚠️ Note: `feat(...)` не `fix(...)` т.к. создаётся новый endpoint.
