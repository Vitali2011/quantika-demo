# Attack Plan: feat/wave-c-engine-logic

Branch: feat/wave-c-engine-logic
HEAD: 13029428
Generated: 2026-06-12

Priorities per brief: cross-path-consistency (matches writers), data-contract
(migration 051 on existing DBs), displayed-value-provenance (dashboard maps, slug,
bucket keys).

## A. Attack items

| # | Target | Technique | Sev if hit |
|---|--------|-----------|------------|
| A1 | Baseline parity: run tests/regression + named pre-existing suites on base e9070fe2 AND branch; diff failure signatures. Carve-in: imsbc/economics/ballast suites overlap branch blast radius | differential run | gate |
| A2 | Migration 051 data-contract on a prod-shaped DB: build DB via full chain to 050 + rows (item idx 0), then apply 051; assert old index dropped, new index live, second-item insert works, dup rejected, down() dedups; runner records version | integration test | CRITICAL |
| A3 | IMSBC `GROUP_A_RESTRICTION_RE` false positives: "no cargo restrictions — concentrates welcome", "no DG; TML certificate available", 40-char window bridging across clauses/sentences; false negatives: "cannot load concentrates", "concentrates not accepted" | regex fuzz table | MEDIUM |
| A4 | Cross-writer consistency: api/matches POST (no item idx) vs persist (item idx) on same pair — duplicate-ish rows? regen pass-2 contentKey vs new index — INSERT clash? | code trace + test | HIGH |
| A5 | computeTce clamp asymmetry: negative quantityMt / negative distance / negative duration → negative or garbage economics that C.8 claims to fix for rate only | unit probes | LOW-MED |
| A6 | toBucketRows drops item indices → MatchesClient bucket key `\|0\|` collides for two same-pair items in review bucket (C.4 demotes BOTH items of a dirty-hold pair → likeliest collision); "item-aware key" claim is a no-op for bucket feed | repro test | MEDIUM |
| A7 | durationDays: Infinity via JSON `1e999` passes `.positive()` (no `.finite()`); NaN rejected? | API probe | LOW |
| A8 | getMatchBySlug determinism: null fit_percent rows, ties; slug consumers (cargo/vessel pages) now linking two visible item matches to one detail row | unit + trace | LOW-MED |
| A9 | refreshComputedColumns on legacy DB (no item cols) and on 051 DB: cross-item clobber gone; user_id NULL branch params order | covered by branch tests + read | HIGH if broken |
| A10 | Readiness C.7 boundary lattice: w=0, w=1, exact midpoint, gapDays=-1 exact, spot in-window unchanged, 'late' boundary unchanged; non-monotonic tight→ideal bump at window start (pre-existing?) | unit probes | MEDIUM |
| A11 | C.6 fallback: 35–50k gap still handysize; 65k boundary; VESSEL_CLASS overlap at 65k (supramax maxDwt 65000 AND panamax minDwt 65000 — Object.entries order decides); 100k exact | unit probes | LOW |
| A12 | Suez quote: totalUsd excludes war-risk — verify no production caller passes vesselValueUsd (grep), and no OTHER test/consumer reads totalUsd expecting war-risk inside (war-risk-v2 #957 chain) | grep + targeted suites | MEDIUM |
| A13 | NT 0.65: Suez branch of canal route — any residual 0.6; voyage route compare-routes endpoint NT | grep | LOW |
| A14 | Bosporus edge: port classifying to 'unknown' basin via resolvePort recursion; Istanbul (med) ↔ Izmit; basin regex overlap (e.g. 'suez' in med list vs Suez transit) — behavior change only for blacksea↔{atlantic,indian,eastafrica,westafrica} | unit probes | LOW |
| A15 | Typecheck + full targeted battery (lib/matching, lib/sailing, lib/economics, __tests__/api, tests/unit/economics, tests/regression, __tests__/hold-cleanliness, lib/__tests__/matching) | gate | gate |
| A16 | Hidden stale pins: repo-wide grep for tests asserting 0.6 NT / capesize-95k / totalUsd+warRisk / whole-window-ideal that branch missed | grep | MEDIUM |

## B. Execution notes

- tests/regression runs need `--testPathIgnorePatterns "/node_modules/"`.
- tsc via `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`.
- NO full `npm test`.
- New tests land in `tests/regression/` as `<feature>-<class>.test.ts`, pinned-behavior
  style ([FINDING]/[BEHAVIOR] markers), kept green.
- LLM creds dead → network-credential failures are environmental.
