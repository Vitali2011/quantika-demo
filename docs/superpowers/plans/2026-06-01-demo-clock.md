# Plan: demo-clock — freeze app date to seed frozen_date (demoNow), DEMO-FRESHNESS ONLY

## Context
Seeded demo data is anchored to demo_seed_meta.frozen_date ('2026-05-28'). Real-time clocks make seeded data "go stale" (matches decay, market shows "stale", laycan expires, emails age). Freeze ONLY the demo-freshness clocks to frozen_date so the demo stays crisp. `lib/clock.ts` ALREADY EXISTS (server-side: returns frozen_date in DEMO_MODE, cached) + `lib/demo-mode.ts` getFrozenDate(). Build it out + wire to client + route the demo-freshness clocks.

## Goal
One demoNow() knob: server reads frozen_date (cached) -> env DEMO_CLOCK -> default '2026-05-28' (noon UTC). If NOT demo-mode -> real Date.now() (prod-safe). Client gets frozen_date via root-layout -> context (NOT build-time NEXT_PUBLIC). Route ONLY demo-freshness clocks through demoNow(). REAL-time clocks (sessions, trial, currency, audit) UNTOUCHED.

## demoNow() spec
- Server: extend `lib/clock.ts` -> demoNow(): (a) demo_seed_meta.frozen_date (cached) -> (b) process.env.DEMO_CLOCK -> (c) default '2026-05-28'; timestamp = NOON UTC of that day. If none AND not demo-mode -> real Date.now() (prod-safe fallback).
- Client: root layout (server component) reads frozen_date -> passes to a client context/provider; client demoNow() reads from that context. Do NOT use NEXT_PUBLIC_ build-time bake.

## ALLOW-LIST — route through demoNow() (DEMO-FRESHNESS ONLY)
1. MatchesClient `clientNow` — effectiveScore decay + isFreshMatch.
2. app/market/page.tsx — market staleness `now` (so /market shows "Live · synced", not "stale").
3. lib/utils/fmt-laycan.ts `isLaycanExpired` — laycan-expiry reference now.
4. lib/classification-service.ts (~L50) — email-age.
5. readiness verdict "now" (if computed live).
6. vetting refYear -> year from demoNow (render-time; do NOT also bake via seed — regen handles seed separately).
7. recent-fixtures 24h window.

## DENY-LIST — DO NOT TOUCH (REAL time; freezing these BREAKS prod)
- `lib/session-store.ts` — session expiry / cleanup (Date.now L109/139/191). Sessions MUST expire on real time.
- `lib/trial.ts` — trial start/end (new Date L36/37/72/76). Billing/trial MUST be real time.
- `lib/currency.ts` — currency cache TTL. Cache freshness MUST be real time.
- ai-provider latency t0; audit/notifications timestamps; created_at/fetched_at on any record.
- ANY Date.now()/new Date() NOT explicitly in the allow-list.

## Risk-override -> /test-skill MANDATORY (do-not-freeze audit is the point)
The QA MUST:
- Classify EVERY Date.now()/new Date() touched-or-nearby as demo-freshness vs real-time; confirm ONLY demo-freshness ones route through demoNow.
- Test: frozen_date='2026-05-28' -> scores/fresh/laycan/email-age render as of May 28 and DO NOT change when the system clock is shifted (mock system time).
- Test (SAFETY-CRITICAL): a login session STILL expires on REAL time (session-store NOT frozen).
- Test: changing frozen_date moves the demo clock (one knob).
- Final line <<EXIT_STATUS=PASS>> or <<EXIT_STATUS=FAIL>>. FAIL if any real-time clock (session/trial/currency) got frozen.

## Acceptance
1. frozen='2026-05-28' -> scores/fresh/laycan/email-age = May 28, stable under system-clock shift (test).
2. /market shows "Live · synced" (no "stale").
3. Login session expires on REAL clock (NOT frozen).
4. Change frozen_date -> demo clocks follow (one knob).
5. /test-skill PASS with the do-not-freeze audit.
UI (matches/market) -> Gate 3 (founder prod Gate 5).

## Out-of-scope
- Do NOT modify session/trial/currency/audit timestamps or created_at/fetched_at.
- Do NOT run regen or modify seed data (vetting refYear stays render-time, not seed).
- Do NOT touch other areas.
