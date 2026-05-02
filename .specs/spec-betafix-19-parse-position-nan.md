# spec-betafix-19-parse-position-nan

**Plan:** beta-fixes | **Batch:** 4 | **Severity:** HIGH
**Source bug:** BUG-β-01-NaNCoords (adversarial)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`lib/ais/datalastic.ts:8-19` — `parsePosition` возвращает `{lat:NaN, lon:NaN, speedKn:NaN}` при missing/garbage Datalastic payload. NaN propagates в route map, ETA, voyage-calculator. SQLite cache poisoned для TTL.

## Files in scope

- `lib/ais/datalastic.ts` (parsePosition)
- `lib/ais/__tests__/datalastic.test.ts`

## Files FORBIDDEN

- `lib/ais/types.ts` (type defs если они стабильны).
- Other lib/ais/* files без direct dependency.

## TDD RED

```ts
import { parsePosition, getPosition } from '../datalastic';

it('empty object → null, not NaN', () => {
  expect(parsePosition({})).toBeNull();
});

it('lat:"not-a-number" → null', () => {
  expect(parsePosition({ lat: 'not-a-number', lon: '0' })).toBeNull();
});

it('lat out-of-range (95) → null', () => {
  expect(parsePosition({ lat: 95, lon: 0 })).toBeNull();
});

it('lon out-of-range (-200) → null', () => {
  expect(parsePosition({ lat: 0, lon: -200 })).toBeNull();
});

it('valid: lat:51.5, lon:0.1 → object', () => {
  const r = parsePosition({ lat: 51.5, lon: 0.1, speed: 12 });
  expect(r).not.toBeNull();
  expect(r!.lat).toBe(51.5);
  expect(Number.isFinite(r!.speedKn)).toBe(true);
});

it('getPosition returns null when API gives garbage (cache не poisoned)', async () => {
  // mock fetch to return malformed; ensure null returned and cache не writes NaN
});
```

## Fix sketch

```ts
// lib/ais/datalastic.ts
function parsePosition(data: Record<string, unknown>): VesselPosition | null {
  const lat = Number(data['lat']);
  const lon = Number(data['lon']);
  const speed = Number(data['speed'] ?? 0);
  
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;
  
  return {
    lat,
    lon,
    speedKn: Number.isFinite(speed) && speed >= 0 ? speed : 0,
    timestamp: typeof data['timestamp'] === 'string' ? data['timestamp'] : new Date().toISOString(),
    source: 'datalastic',
  };
}
```

И в `getPosition`:
```ts
const parsed = parsePosition(rawData);
if (!parsed) {
  logger.warn('datalastic: invalid position payload', { imo, raw: rawData });
  return null; // НЕ writeCache(NaN entry)
}
return parsed;
```

## Acceptance criteria

- [ ] Empty/garbage payload → null.
- [ ] Out-of-range coords → null.
- [ ] Valid coords → object с finite numbers.
- [ ] Cache не получает NaN entries (не writeCache при null parse).
- [ ] Existing tests green.

## Commit

`fix(βf-19-parse-position-nan): finite+range check для AIS position; null on garbage`
