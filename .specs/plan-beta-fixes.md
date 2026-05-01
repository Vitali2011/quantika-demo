# Wave β Fixes — Master Plan

**Plan ID:** beta-fixes
**Integration branch:** `claude/wave-beta-fixes` (от `main @ 022e785`)
**Date:** 2026-05-01
**Sources:** `/tmp/wave-beta-smoke-report.md` (16 bugs), `/tmp/wave-beta-browser-report.md` (3 prod-blockers + 5 HIGH), `.test-review/wave-beta-findings.md` (1 CRIT + 9 HIGH adversarial).

## Decisions (от user'а 2026-05-01)

- **L5C default:** fail-closed (`compatible:false, requires_manual_review:true`) для unknown cargo pairs.
- **war_risk model:** per-voyage % vessel value, JWC 2024-26 ставки 0.05-0.10% per transit.
- **C3 Market Intelligence 503:** investigate VPS env first (TOEPFER/BHSI keys missing — подтверждено через ssh). Defer в OPEN_QUESTIONS — не входит в эту сессию.
- **Auto-deploy:** manual approval после CI green.
- **Scope:** 21 spec в 4 batches.

## Bug-to-spec mapping

| Spec | Severity | Bug ID(s) | Source | File:line |
|---|---|---|---|---|
| spec-betafix-01-distance-nm-validation | CRIT | BUG-16 | smoke | app/api/voyage/tce/route.ts (Zod) |
| spec-betafix-02-l5c-fail-closed | CRIT | BUG-09 | smoke | lib/cargo/l5c-matrix.ts:48 |
| spec-betafix-03-port-da-wiring | HIGH | BUG-02, BUG-05 | smoke | lib/economics/voyage-calculator.ts + lib/port-da/repository.ts |
| spec-betafix-04-war-risk-gate-and-rate | HIGH | BUG-03, BUG-07 | smoke | lib/economics/war-risk.ts |
| spec-betafix-05-mpp-enum-extension | HIGH | BUG-01 | smoke | app/api/voyage/tce/route.ts:26 |
| spec-betafix-06-savings-days-exposure | HIGH | BUG-06, BUG-β-06-WinnerSavingsMismatch | smoke + adversarial | lib/economics/route-decision.ts:168 |
| spec-betafix-07-vessel-imo-endpoint | CRIT | BUG-08 | smoke | app/api/vessel/[imo]/route.ts (NEW) |
| spec-betafix-08-sentinel-deals-provider | HIGH | BUG-13 | smoke | scripts/sentinel-scan.ts:49 |
| spec-betafix-09-fixture-13-or-script | HIGH | BUG-14 | smoke | scripts/check-deadlines.ts |
| spec-betafix-10-auto-prequote-demo-wire | HIGH | BUG-15 | smoke | scripts/auto-prequote-cron.ts |
| spec-betafix-11-parse-cargo-timeout | HIGH | H1 | browser | app/api/ai/parse-cargo/route.ts |
| spec-betafix-12-vessel-cii-parse | HIGH | H4 | browser | lib/prompts/vessel-parse*.ts |
| spec-betafix-13-react-418-hydration | CRIT | C1 | browser | TBD по диагностике |
| spec-betafix-14-csrf-draft-quote-client | CRIT | C2 | browser | client component(s) for "Draft Quote" |
| spec-betafix-15-gmail-extension-xss | CRIT | BUG-β-13-XSS, BUG-β-stab-04-XSSBypass, BUG-β-13-AttrXSS, BUG-β-13-EconomicsZeroPath | adversarial | extensions/gmail/inserts/* + app/api/extension/draft/route.ts |
| spec-betafix-16-plan-first-cache-replay | HIGH | BUG-β-11-PlanCacheReplay | adversarial | lib/agent/plan-first.ts:149 |
| spec-betafix-17-empty-rawtext-guard | HIGH | BUG-β-stab-03-EmptyRawText | adversarial | lib/whatsapp/forward-parser.ts:146 |
| spec-betafix-18-pipedrive-oauth-refresh | HIGH | BUG-β-02-OAuthRefreshMissingCreds | adversarial | lib/integrations/pipedrive/tokens.ts:189 |
| spec-betafix-19-parse-position-nan | HIGH | BUG-β-01-NaNCoords | adversarial | lib/ais/datalastic.ts:8 |
| spec-betafix-20-passport-nan-guards | HIGH | BUG-β-13-PassportNaN | adversarial | extensions/gmail/inserts/passport.ts:54 |
| spec-betafix-21-queue-guards-verify | HIGH | BUG-β-15-IdempotencyReplay, BUG-β-15-EnqueueValidation | adversarial | lib/auto-prequote/queue.ts (verify-and-skip) |

## Batches

```
Batch 1 (parallel): API economics safety
  spec-betafix-01..06   (6 specs)

Batch 2 (parallel): Endpoints / scripts
  spec-betafix-07..12   (6 specs)

Batch 3 (parallel): UI prod-blockers
  spec-betafix-13..14   (2 specs)

Batch 4 (parallel): Adversarial security/state
  spec-betafix-15..21   (7 specs)
```

## Overlap check

| File | Specs touching | Resolution |
|---|---|---|
| `app/api/voyage/tce/route.ts` | 01 (distanceNm Zod), 05 (vessel.type enum) | Sequential merge: 01 → 05. spec-05 владеет файлом, обновляет только vessel.type enum. spec-01 — distanceNm Zod field. Разные части schema. |
| `lib/economics/voyage-calculator.ts` | 03 (resolveDaUsd + applicable.da), 04 (applicable.war_risk) | Sequential merge: 03 → 04. Разные блоки `applicable: {...}`. |
| `lib/economics/route-decision.ts` | 06 (savings_days exposure) | Sole owner. |
| `lib/auto-prequote/queue.ts` | 21 (verify-and-skip — likely no-op) | Если verify passes (already fixed), no commit; иначе sole owner. |
| `extensions/gmail/inserts/*.ts` | 15 (XSS family) и 20 (passport NaN) | spec-20 trades только `extensions/gmail/inserts/passport.ts:54,65` — спец-15 владеет index.ts, bimco.ts, economics.ts; passport.ts частично у обеих. **Резолюция:** spec-15 merge first; spec-20 rebases на result; final merge sequential. |

## QA gate (Two-Agent Model — wave-audit lessons)

Per-spec adversarial QA после impl agent — clean session, не видит impl-agent сообщений. Verdict ∈ `{MERGE, BLOCK_AND_FIX, BLOCK_AND_DESIGN_REVIEW}`. `BLOCK_AND_FIX` → re-spawn impl с findings.

## Acceptance for whole wave

1. `caffeinate -ids npm test -- --silent` → ≥ 1721 passing, 0 failing.
2. `npm run lint` → 0 errors.
3. `npx tsc --noEmit` → 0 errors.
4. `caffeinate -ids npm run build` → success.
5. Smoke re-run: distanceNm=-100 → 400; /api/vessel/9322180 → 200+JSON; L5C unknown pair → fail-closed; Draft Quote click → 200; React #418 console = 0.
6. Adversarial QA на full diff `main..claude/wave-beta-fixes` — verdict MERGE.

## Out of scope (OPEN_QUESTIONS for wave-γ)

См. `.specs/OPEN_QUESTIONS.md` (создаётся в Phase 4 параллельно с specs).
