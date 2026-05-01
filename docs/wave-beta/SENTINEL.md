# Sanction Sentinel — Operator Runbook (β-09)

## Что это

Background scanner, который пробегает активные сделки и сверяет каждого
counterparty / vessel / port с обновлёнными OFAC / EU / UK санкционными
списками + локальным `lib/sample-data/sanction-corpus/`. На каждый match
генерируется `SentinelAlert` с уровнем severity и dispatching через
`lib/notifications/`.

## CLI

```bash
# Cron mode — полный re-scan всех активных сделок (ежедневно).
tsx scripts/sentinel-scan.ts --mode=cron

# Event-driven — только сделки изменившиеся после --since (точечно).
tsx scripts/sentinel-scan.ts --mode=event --since=2026-04-29T00:00:00Z
```

Exit codes:
- `0` — scan succeeded (даже если 0 alerts)
- `1` — error during scan

Logging — structured JSON (для cron pipelines / Datadog / Sentry).

## Severity rules

| Severity | Условие |
|---|---|
| `critical` | exact name match + OFAC SDN или EU consolidated list |
| `high` | fuzzy match ≥ 0.9 + OFAC |
| `medium` | fuzzy match 0.75–0.9 |
| `low` | alias / weak signal (≥ 0.5) |

Alerts с `severity ≥ medium` дополнительно эскалируются compliance-officer'у.

## Active deals source

`scanActiveDeals()` принимает опциональный `dealsProvider` callback. По
умолчанию — пустой список (deals API ещё не реализовано). В production
inject your own:

```typescript
import { scanActiveDeals } from '@/lib/sanctions/sentinel';
import { listActiveDeals } from '@/lib/deals'; // ваш модуль

const alerts = await scanActiveDeals({
  source: 'opensanctions-update',
  dealsProvider: listActiveDeals,
});
```

## Root cause — «Matching pipeline 0 matches» (E2E Wave α finding)

E2E acceptance review Wave α зафиксировал, что demo onboarding отдаёт
**0 matches** даже когда есть и cargo и vessel inquiries.

**Корневая причина** — двухуровневая:

1. **Seed-фильтр для MENA-демо** использовал один и тот же port-pattern
   и для cargoes и для vessels (`filterByRegion`). MENA cargoes грузятся
   в Турции/Египте, но vessels стоят в Med/Black Sea. В результате после
   фильтрации получалось 13 cargoes vs 1 vessel, и большинство пар
   отсеивалось ещё до анализа. Уже починено в `lib/onboarding/demo-seed.ts`
   через раздельные `CARGO_REGION_PORTS` и `VESSEL_REGION_PORTS`
   (regression: `lib/__tests__/matching/mena-seed-matching.test.ts`).

2. **AI scorer fail-open в demo / offline**: `app/api/ai/match/route.ts`
   передаёт в `analyzePairs` `aiScorer`, который при ошибке OpenAI / cliproxy
   возвращает `[]`. Без deterministic sweep это давало бы тоже 0 matches.
   `pair-analyzer.ts` уже содержит **sweep-механизм** (lines 341–428): для
   каждой пары, прошедшей hard-filters, но не выбранной LLM, генерится
   match со `score=25`/`weak` на основе только deterministic данных
   (DWT, distance, gap days). Любая регрессия sweep-механизма мгновенно
   возвращает demo в state «0 matches».

**Regression test** — `tests/integration/matching-pipeline.test.ts`:
- грузит MENA-фильтрованные cargo+vessel из `lib/sample-data/`,
- зовёт `analyzePairs` с пустым AI scorer (симулирует offline / no-key),
- assert: `matches.length > 0` (sweep работает).

Эта проверка предотвращает повторное появление 0-matches finding'а,
независимо от состояния OpenAI / cliproxy.
