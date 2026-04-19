# Phase 1 — Scope: Wave-5 follow-up (3 gaps)

## Spec Summary
Закрыть 3 gap'а из аудита Wave 5 против dev-pipeline v2026-04-19:
1. Contract test: `ConfidenceLevel` ↔ `CONFIDENCE_MULTIPLIERS` (QI #12)
2. Deploy preflight: placeholder secrets scanner (QI #14)
3. Migration flag assertion: `USE_MIGRATION_RUNNER=true` в preflight (QI #14)

## Affected Files
- `lib/__tests__/wave5-sanity.test.ts` — +1 test block (Gap #1)
- `scripts/preflight.sh` (NEW) — env scanner + USE_MIGRATION_RUNNER assert (Gap #2+#3)
- `scripts/setup.sh` — вызов preflight.sh перед pm2 restart (wiring)

## Boundaries
### Can Change
- wave5-sanity.test.ts (append 1 `describe` block)
- Новый файл scripts/preflight.sh
- scripts/setup.sh (minimal diff — добавить вызов)

### Cannot Change
- lib/types.ts, lib/sailing/match-scoring.ts — только тестируем существующий инвариант
- Любые route-handlers, middleware
- 23 существующих wave5-sanity теста

### Must Not Break
- `npm test` зелёный (24 теста включая новый)
- `npm run lint` чистый
- setup.sh продолжает работать локально (preflight gracefully skip если .env.local отсутствует — dev mode)

## Work Fronts
Single front — 3 точечных изменения в 3 файлах, нет смысла параллелить.

## Overlap Check
N/A (single front).

## Deletion Inventory
N/A — чистое добавление.

## Entry State Matrix
N/A — не re-entrant codepath.

## Open Questions
Нет.
