# Plan: Market Benchmarks — 30-day history per indicator (seed + data-driven sparkline)

## Context
app/market/page.tsx shows 7 indicators (BDI, BCI, BSI, BHSI, VLSFO, MGO, EUA). The "30-day history" modal currently shows only ~2 points per indicator (e.g. 2026-05-09, 2026-05-28). The mini-trend sparkline is HARDCODED (sparklinePath SVG per indicator + sparklineDir up/down). Each indicator fetches /api/market/baltic-kpi?code=X (and/or /api/market/benchmark). The scrapers (Baltic + EUA/bunker) write only the CURRENT daily value — no 30-day backfill — and the demo is FROZEN at frozen_date (2026-05-28). So real 30-day history does not exist; it must be seeded.

## Goal
Each indicator shows a realistic ~30-day history (ending at frozen_date 2026-05-28) in the modal, and a DATA-DRIVEN sparkline (not hardcoded).

## Investigate FIRST (probe — report findings)
- lib/market/market-indices-repository.ts — which DB + table do the indices live in (demo-seed.db, the sessions DB, or a separate market DB)? How many history rows per indicator now?
- /api/market/baltic-kpi (+ /api/market/benchmark) route — does it cap/limit the returned history? Does it return a full series?
This determines whether the backfill SHIPS in demo-seed.db or must be APPLIED on prod by the orchestrator — REPORT which.

## Scope (Tier M)
1. BACKFILL script: seed ~30 daily points per indicator into the market-indices table(s), ending at frozen_date (2026-05-28), with a realistic trend toward the current value (BDI 3226, BCI 5517, BSI 1100, BHSI 847, VLSFO 699.5, MGO 1192, EUA 78.2) consistent with the existing sparklineDir (up/down). Idempotent. `--dry` mode (report counts + sample). `--db` flag.
2. ROUTE: ensure /api/market/baltic-kpi (+benchmark) returns the full ~30-day series (raise any cap if it truncates).
3. RENDER: app/market/page.tsx — derive the sparkline from the 30-day series (remove the hardcoded sparklinePath); the modal shows ~30 rows.

## Out-of-scope
- Do NOT change the scrapers' live fetch logic; do NOT change frozen_date; demoNow/#744 already frozen — ALL series dates MUST be <= frozen_date (2026-05-28).
- Do NOT touch other pages or the EUA-period freeze in api/market/benchmark (just-merged #746 — leave it).

## Risk-override (data feeds a financial market widget) -> /test-skill MANDATORY
Verify: values realistic + trend toward current; ALL dates <= frozen_date; idempotent (re-run = no-op); sparkline derives from the data (no hardcode left). Require <<EXIT_STATUS=PASS|FAIL>>.

## Acceptance
- Modal shows ~30-day history per indicator; sparkline is data-driven; values realistic and <= frozen_date. tsc --noEmit + lint clean. Report whether the backfill ships in demo-seed.db or needs orchestrator to apply on prod. Commit + push + PR.
