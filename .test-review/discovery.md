# Phase 1 — Discovery

**Date:** 2026-04-28  
**Reviewer:** test-skill (cold-start adversarial QA)  
**Target:** `Vitali2011/quantika-demo` — PR #8 (wave-alpha → main)  
**Mode:** post-merge (PR already merged; treats `8821b12..4387573` as the review range)

---

## Commit inventory

100 commits merged via PR #8. Key merge commits (sub-waves):

| Sub-wave | Merge commit | Specs |
|---|---|---|
| Wave 0 | `219ef18`, `26a71e4` | 00a-breakbulk-sample-data, 00b-fix-dead-cargotype-tests |
| Wave 1 | `531e47e` | 01-types-and-interfaces, 02-confidence-engine, 03-audit-trail |
| Wave 2 | `0447ff2`, `d98beb5`, `1c3b9c1`, `01dc08e` | 04-whatsapp-infra, 05-gmail-extension-base |
| Wave 3 | `55948a8`, `9a8d607`, `1d32232` | 07-dashboard-morning-view, 08-economics-engine, 09-whatsapp-onboarding-digest |
| Wave 4 | `eae7c15`, `2a5b49e`, `6bd1236`, `06e2def` | 10-whatsapp-forward-anything, 11-vessel-passport-upgrade, 12-gmail-ghost-text-sidebar, 13-source-attribution-rtl |
| Spec 14-15 | `a5d95ef`, `b408a0c` | 14-market-benchmark, 15-trial-onboarding |

3 specs required manual merge after wave-pipeline resume bug: #10, #11, #13.

---

## Files changed (summary)

`git diff 8821b12..4387573 --stat`: 159 files, +12,990 / -2,819 lines

**New directories:**
- `lib/economics/` — bunker, ETS, war-risk, split-bunker calculators
- `lib/sanctions/` — IACS, P&I clubs, Paris MoU, OpenSanctions, shadow-fleet
- `lib/whatsapp/` — client, router, forward-parser, image-ocr, voice-transcribe, pdf-extract, onboarding, digest
- `lib/market/` — Toepfer TMI scraper, benchmark service
- `lib/onboarding/` — demo-seed, activation-tracker
- `lib/i18n/` — RTL detection
- `extensions/gmail/` — Manifest v3 Chrome extension

**New API routes:** 8 routes (audit, economics, whatsapp/webhook, whatsapp/ingest, extension/context, extension/draft, market/benchmark, onboarding/demo-data)

**New migrations:** 6 new (002–007); collision fix for 005→007 opensanctions.

---

## Existing test coverage (pre-attack-skill)

+301 new tests (1048 → 1349). 44 new test suites covering:
- `lib/__tests__/confidence.test.ts` — confidence engine (basic happy path)
- `lib/__tests__/whatsapp-signature.test.ts` — webhook signature (basic)
- `lib/__tests__/economics.test.ts` — economics aggregator
- `lib/__tests__/sanctions.test.ts` — shadow fleet
- `lib/__tests__/trial.test.ts` — trial lifecycle
- `lib/__tests__/rtl-detect.test.ts` — RTL detection

---

## Known issues from retro

1. Migration collision — 005-market-benchmarks vs 007-opensanctions-cache (fixed in `7df9f2b`)
2. Pipeline resume bug — 3 manual merges required post-pause
3. ScheduleWakeup unreliable (wave-pipeline infra issue, not app code)

---

## Spec files present

27 spec files in `.specs/` — 15 alpha specs plus earlier v0.3 specs.  
All 15 alpha specs confirmed present and readable.

---

## Attack surface signal (preview for Phase 2)

Files requiring adversarial attention:
- `lib/whatsapp/signature.ts` — HMAC auth (security-critical)
- `lib/confidence.ts` — `blockSend` gate (correctness-critical)
- `lib/economics/ets.ts` + `bunker.ts` + `war-risk.ts` — financial calculators
- `lib/whatsapp/forward-parser.ts` — external input handler
- `lib/i18n/rtl-detect.ts` — Unicode normalizer
- `lib/trial.ts` — business logic / expiry gate
- `lib/sanctions/opensanctions.ts` — external API + cache
