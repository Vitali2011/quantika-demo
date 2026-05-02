# spec-betafix-05-mpp-enum-extension

**Plan:** beta-fixes | **Batch:** 1 | **Severity:** HIGH
**Source bug:** BUG-01 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`POST /api/voyage/tce` с `vessel.type: "MPP"` → 422 Validation Error: "Invalid enum value. Expected 'bulker'|'tanker'|'container'|'general'". MPP (Multi-Purpose vessel) — **дominant type** для break-bulk и project cargo. Real broker workflow blocked.

User decision: minimum — добавить `'mpp'`. `heavy_lift`/`ro_ro` — defer to wave-γ.

## Files in scope

- `app/api/voyage/tce/route.ts:26` (vessel.type Zod enum)
- `app/api/voyage/compare-routes/route.ts` (если такой же enum)
- `lib/economics/types.ts` (если VesselType типизирован централизованно)
- `app/api/voyage/tce/__tests__/route.test.ts`

## Files FORBIDDEN

- Все downstream consumers vessel.type — изменения только в enum definition + любые exhaustive switch'и где TS компилятор скажет "MPP не покрыт". Если switch есть — добавить branch к `'general'` semantics (MPP fallback to general).

## TDD RED

```ts
it('accepts vessel.type:"mpp"', async () => {
  const req = makeReq({ vessel: { type: 'mpp', dwt: 30_000, bunkerMtPerDay: 25 }, route: { distanceNm: 5000, /* … */ } });
  const res = await POST(req);
  expect(res.status).toBe(200);
});

it('case-insensitive: vessel.type:"MPP" — accepts via Zod transform OR rejects clear', async () => {
  // pick one: либо transform.toLowerCase, либо строгое 'mpp' — спецификация решает строгое 'mpp' (TS literal). User должен слать lowercase.
});

it('vessel.type:"unknown_xyz" → 422', async () => {
  const req = makeReq({ vessel: { type: 'unknown_xyz', /* … */ } });
  expect((await POST(req)).status).toBe(422);
});

it('without vessel.type → defaults to bulker (existing behavior)', async () => {
  // existing test should still pass
});
```

## Fix sketch

```ts
// app/api/voyage/tce/route.ts
const VesselSchema = z.object({
  type: z.enum(['bulker', 'tanker', 'container', 'general', 'mpp']).optional(),
  // ...
});
```

Если в `route.ts:55` `body.vessel.type ?? 'bulker'` — оставить как есть (default bulker — sane).

Centralize в `lib/economics/types.ts` если там есть `export type VesselType = ...` — там тоже добавить.

## Acceptance criteria

- [ ] `type:"mpp"` → 200.
- [ ] `type:"general"` → 200 (existing behavior preserved).
- [ ] `type:"bulker"`, `"tanker"`, `"container"` — 200.
- [ ] Unknown — 422.
- [ ] No-type → default к bulker (existing).
- [ ] TS exhaustive switches покрывают `'mpp'` (либо нет таких switch'ей).
- [ ] `npx tsc --noEmit` 0 errors.

## Commit

`fix(βf-05-mpp-enum-extension): add 'mpp' to vessel.type enum`
