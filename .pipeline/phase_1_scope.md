# Phase 1 — Scope: Wave α Acceptance Bug-Fix

**Date:** 2026-04-28
**Branch:** `fix/wave-alpha-acceptance` от `main` (post-Wave-α)
**Reference:** `.test-review/verdict.md`, `.test-review/findings.md`

## Freshness check
Все 6 файлов проверены на `origin/main` — баги ещё актуальны (не зафикшены другими PR'ами).
Regression suite запущен на main: **24 failed / 60 passed / 84 total** ← exact match с verdict.md.

## Boundaries

**Can change:**
- `lib/whatsapp/signature.ts`, `lib/confidence.ts`, `lib/economics/ets.ts`, `lib/economics/war-risk.ts`, `lib/whatsapp/forward-parser.ts`, `lib/sanctions/opensanctions.ts`
- `tests/regression/*` (commit — сейчас untracked)
- `jest.regression.config.mjs` (commit)
- `package.json` — добавить `test:regression` script

**Cannot change:** function signatures, schema БД, миграции, env var имена.

**Must not break:** `npm test` (1349 unit tests), `npm run build`, `npm run test:smoke`.

## Work fronts (последовательно, без worktree — 5 файлов изолированы)

| F | File | Failing tests today | Fix |
|---|------|---------------------|-----|
| F0 | tests/regression/* + jest.regression.config.mjs + package.json | — | Commit как RED baseline |
| F1 | signature.ts:8 | 3 | `!signature \|\| !appSecret` |
| F2 | confidence.ts:35,170 | 7 | `!Number.isFinite(score)` + empty criticalFields → `'missing'` |
| F3 | ets.ts:19 | 4 | extend guard: `vlsfoBurnMt <= 0 \|\| euaPrice <= 0 \|\| euLegPercent > 1` |
| F4 | war-risk.ts:54,67 | 3 | word-boundary regex + `vesselValueUsd <= 0 → 0` |
| F5 | forward-parser.ts:75 | 6 | `if (!rawText) return uncertain` ДО `callAiJson` |
| F6 | opensanctions.ts:61 | 1 | `if (!name.trim()) return []` |

## Open questions
None.

## Gate
✅ Scope ready — переход к Phase 2.
