# spec-betafix-08-sentinel-deals-provider

**Plan:** beta-fixes | **Batch:** 2 | **Severity:** HIGH
**Source bug:** BUG-13 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`scripts/sentinel-scan.ts:49` — `defaultDealsProvider` хардкоден stub `return [];`. Sanction Sentinel CLI всегда обрабатывает 0 deals → `alertCount:0` независимо от corpus. Sanction-04 false-positive test невозможно прогнать.

## Files in scope

- `scripts/sentinel-scan.ts` (replace defaultDealsProvider)
- `lib/sanctions/__tests__/sentinel-scan.test.ts` или новый test файл для CLI integration
- (опционально) `lib/sample-data/deals.ts` или подобный source — если нет, создать.

## Files FORBIDDEN

- `lib/sanctions/match-engine.ts` (BUG-β-09 deferred)
- `lib/sanctions/corpus/*.json` (read-only)

## Investigation

```bash
grep -n "defaultDealsProvider\|loadDeals\|getActiveDeals" scripts/ lib/ 2>/dev/null | head
ls lib/sample-data/ | grep -iE "deal|sanction"
```

Если есть `lib/sample-data/deals.json` или corpus — использовать. Иначе создать минимальный fixture с 5 deals соответствующих corpus 01-05.

## TDD RED

```ts
import { runSentinelScan } from '../sentinel-scan'; // export от main

it('default provider загружает deals from sample-data, не []', async () => {
  const result = await runSentinelScan({ /* default */ });
  expect(result.processedDealsCount).toBeGreaterThan(0);
});

it('Sanction-04 false-positive (same vessel name, different IMO) → no alert', async () => {
  const result = await runSentinelScan({ /* fixture с corpus 04 deal */ });
  // expect alert NOT generated for этого специфического deal
  expect(result.alerts.find(a => a.dealId === 'sample-sanction-04-fp')).toBeUndefined();
});

it('Sanction-01..03 (true positives) → alerts generated', async () => {
  const result = await runSentinelScan({ /* */ });
  expect(result.alerts.length).toBeGreaterThanOrEqual(3);
});
```

## Fix sketch

```ts
// scripts/sentinel-scan.ts
import { sampleDeals } from '@/lib/sample-data/deals'; // create if missing

async function defaultDealsProvider(): Promise<ActiveDeal[]> {
  // если existing demo session db есть — читаем оттуда; иначе — sample-data fixture
  if (process.env.SENTINEL_DEALS_DB) {
    return await loadDealsFromDb(process.env.SENTINEL_DEALS_DB);
  }
  return sampleDeals;
}
```

Sample deals fixture (5-10 entries) должен покрывать:
- 1-2 deals с counterparty matching corpus 01-03 (true positives)
- 1 deal с similar vessel name но different IMO (false positive — corpus 04)
- 1-2 clean deals (no match)

## Acceptance criteria

- [ ] Default scan не возвращает 0 processedDeals.
- [ ] Corpus 01-03 → alerts ≥ 3.
- [ ] Corpus 04 false-positive → не генерит alert.
- [ ] Tests green.

## Commit

`fix(βf-08-sentinel-deals-provider): wire defaultDealsProvider to sample-data deals`
