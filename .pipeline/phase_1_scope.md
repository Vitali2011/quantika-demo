# Phase 1 Scope — γ-01 multi-currency-v2

## Assumptions (Rule A)

Понимаю задачу как: заменить exchangerate.host на Frankfurter API, добавить NOK+AED в fallback,
создать fx_rates SQLite table + daily cron, UI dropdown за MULTI_CURRENCY_V2_ENABLED=false flag.
Альтернатива: оставить in-memory cache. Иду по DB-backed — spec явно требует "SQLite таблица fx_rates".
UI: только при flag=true, дефолт false → продовое поведение не меняется.

## Scope Freshness Check

- exchangerate.host ещё в lib/currency.ts:48 ✅ (нужно менять)
- fx_rates таблицы нет (migrations 001-024 проверены) ✅
- MULTI_CURRENCY_V2_ENABLED не существует в .env.local.example ✅

## Affected Files

| Файл                                       | Действие                                                      |
| ------------------------------------------ | ------------------------------------------------------------- |
| lib/currency.ts                            | Replace API, add NOK/AED, add DB layer (4-tier priority)      |
| lib/types.ts:516                           | Add "frankfurter" to source union                             |
| lib/migrations/025-fx-rates.ts             | NEW — fx_rates table                                          |
| lib/migrations/index.ts                    | Register migration 025                                        |
| lib/market/fx-rates-repository.ts          | NEW — getLatestFxRate + upsertFxRate                          |
| scripts/knowledge/cron/refresh-fx-rates.ts | NEW — daily cron job                                          |
| components/match/EconomicsTab.tsx          | Add currency dropdown (behind flag)                           |
| .env.local.example                         | Add MULTI*CURRENCY_V2_ENABLED=false + NEXT_PUBLIC*            |
| lib/**tests**/currency.test.ts             | Update mocks: exchangerate.host → Frankfurter + NOK/AED tests |
| lib/**tests**/fx-rates-repository.test.ts  | NEW — unit tests for repository                               |

## Boundaries

- CAN CHANGE: все 10 файлов выше
- CANNOT CHANGE: lib/economics/voyage-calculator.ts (EUR_TO_USD там для EUA, не currency)
- MUST NOT BREAK: existing TCE API behavior, all 4075+ existing tests

## Cross-Cutting Surface (Rule C — 10 files ≥ 5)

| Файл                           | Символ                 | Риск                                 |
| ------------------------------ | ---------------------- | ------------------------------------ |
| lib/**tests**/currency.test.ts | exchangerate.host mock | MEDIUM — нужно обновить URL в тестах |

Остальные: convertCurrency не импортируется ни одним production файлом → LOW

## Open Questions

Нет — все решения приняты.
