# spec-betafix-03-port-da-wiring

**Plan:** beta-fixes | **Batch:** 1 | **Severity:** HIGH
**Source bugs:** BUG-02, BUG-05 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`/api/voyage/tce` и `/api/voyage/compare-routes` возвращают `da_usd: 0, applicable.da: false` для всех портов. У real broker'а Lagos DA для 30k DWT MPP ≈ $90-120k, Rotterdam ≈ $80-100k. Без DA → TCE завышен в 2-4 раза → unusable для commercial calls.

Root cause: либо `lib/port-da/repository.ts` БД не seeded для нужных портов, либо `resolveDaUsd()` в `lib/economics/voyage-calculator.ts` не вызывается / fallback в 0.

## Files in scope

- `lib/economics/voyage-calculator.ts` (resolveDaUsd + applicable.da)
- `lib/port-da/repository.ts` (если seed нужен)
- `lib/port-da/__tests__/repository.test.ts` или `lib/economics/__tests__/voyage-calculator.test.ts`
- `lib/port-da/seed-data.ts` или подобный файл для seed (если такой паттерн)
- (если БД sqlite) миграция или seed скрипт

## Files FORBIDDEN

- `lib/economics/war-risk.ts` (другая спека)
- `app/api/voyage/tce/route.ts` (другая спека)

## Investigation steps (do FIRST)

1. `grep -n "resolveDaUsd\|getPortDa\|portDa" lib/economics/voyage-calculator.ts lib/port-da/*.ts`
2. Прочитать `lib/port-da/repository.ts` — есть ли seed? Где данные хранятся (sqlite? in-memory? json fixture)?
3. Проверить test fixture: какой UNLOCODE используется в тестах. Какие порты ожидаются.
4. Запустить smoke-test:
   ```bash
   cd /Users/jarvis/work/quantika-demo && npx tsx -e "
     import { getPortDa } from './lib/port-da/repository';
     console.log(await getPortDa('NGAPP', 30000));  // Lagos
     console.log(await getPortDa('NLRTM', 35000));  // Rotterdam
   "
   ```

## TDD RED

```ts
// lib/port-da/__tests__/repository.test.ts (или voyage-calculator integration test)
import { getPortDa } from '../repository';

it('Lagos NGAPP DA для 30k DWT >= $90,000', async () => {
  const da = await getPortDa('NGAPP', 30000);
  expect(da).toBeGreaterThanOrEqual(90_000);
  expect(da).toBeLessThanOrEqual(150_000);
});

it('Rotterdam NLRTM DA для 35k DWT >= $80,000', async () => {
  const da = await getPortDa('NLRTM', 35000);
  expect(da).toBeGreaterThanOrEqual(80_000);
});

it('Singapore SGSIN DA для 35k DWT в диапазоне $60-90k', async () => {
  const da = await getPortDa('SGSIN', 35000);
  expect(da).toBeGreaterThanOrEqual(60_000);
  expect(da).toBeLessThanOrEqual(90_000);
});

// integration test через voyage-calculator
it('TCE Antwerp→Lagos для 30k DWT — applicable.da:true и da_usd > 80,000', async () => {
  const result = await calculateTCE({ /* … */ });
  expect(result.applicable.da).toBe(true);
  expect(result.da_usd).toBeGreaterThan(80_000);
});
```

## Fix sketch

**Если БД пустая** — seed данных в `lib/port-da/seed.ts` с industry midpoints:

| UNLOCODE | Port | 30k DWT DA (USD) |
|---|---|---|
| NGAPP | Lagos/Apapa | 100_000 |
| NLRTM | Rotterdam | 90_000 |
| BEANR | Antwerp | 85_000 |
| ZADUR | Durban | 75_000 |
| SGSIN | Singapore | 70_000 |
| EGSUZ | Suez | 50_000 |
| AEDXB | Dubai | 60_000 |
| TRMER | Mersin | 55_000 |
| JOAQB | Aqaba | 45_000 |
| LYMRA | Misurata | 60_000 |

Scaling по DWT: linear через ~30k baseline. Если DWT 50k — DA ≈ baseline × (1 + 0.4 × (DWT - 30000)/30000).

**Если seed уже есть, но не вызывается** — починить wiring в `voyage-calculator.ts`:
```ts
const da_usd = body.da_usd_override ?? await resolveDaUsd(loadPort, vessel.dwt) ?? 0;
const da_applicable = da_usd > 0;
```

## Acceptance criteria

- [ ] `getPortDa('NGAPP', 30000)` returns ≥ $90,000.
- [ ] `getPortDa('NLRTM', 35000)` returns ≥ $80,000.
- [ ] `getPortDa('SGSIN', 35000)` returns $60k-$90k.
- [ ] TCE response для Lagos: `applicable.da:true, da_usd > 80_000`.
- [ ] compare-routes: оба leg'а имеют positive da_usd.
- [ ] Unknown UNLOCODE → fallback (либо null с лог, либо средний $80k — на выбор impl).
- [ ] Tests green.

## Commit

`fix(βf-03-port-da-wiring): seed Port DA для 10 demo ports + wire applicable.da:true`
