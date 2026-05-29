# Demo-seed → session hydration (show the frozen snapshot on login)

**Date:** 2026-05-29
**Status:** Implemented
**Owner:** Виталий (founder) + Claude session

## Problem

`demo.quantika.org` should display the audited **frozen snapshot** (153 anonymized broker emails

- 436 matches in `data/demo-seed.db`, frozen "today" = 2026-05-28). The snapshot is built, fixed,
  and deployed to prod, and `DEMO_MODE=true` + `SESSIONS_DB_PATH=data/demo-seed.db` are live. But the
  UI renders from a per-session blob (`session.emails` / `session.matches`), and the snapshot was
  never loaded into a session for display.

## Context — what main already has (#611)

Current `main` ships PR #611: in `DEMO_MODE`, `POST /api/auth/login` auto-creates a session on
successful login (`createDemoSession()` in `lib/sample-data/create-demo-session.ts`) and sets the
`session_id` cookie — fixing the empty-dashboard state. **But it seeds the legacy
`lib/sample-data/*.json` sample data, not the frozen snapshot.** So after login the demo shows the
old sample data, not the audited anonymized corpus.

## Approach (implemented)

Reuse main's existing login auto-seed seam; swap only its **data source**:

1. **`hydrateDemoSession(sessionId)`** (`lib/demo-mode/hydrate-demo-session.ts`, new) — reads the
   `emails` / `parsed_results` / `matches` tables from the served `demo-seed.db` (via
   `getStore().getDatabase()`) and writes them into the session blob via `updateSession`. A pure
   `buildDemoSessionBlob(db)` does the table→`SessionData` mapping (matches loaded as-is, level via
   the existing `deriveMatchLevel`; `processedEmails` via the existing `buildProcessedEmails`).
2. **Login route** (`app/api/auth/login/route.ts`) — in the existing `DEMO_MODE` block, replace
   `createDemoSession()` with `createSession('demo-seed')` + `hydrateDemoSession(sessionId)`, and
   also set a `csrf_token` cookie + `X-CSRF-Token` header (so demo `/api/ai/*` calls — e.g. the
   "Explain deal" modal — pass the middleware double-submit CSRF check).

That is the whole change. No new routes, no page edits.

## Non-goals / left unchanged

- The legacy **"Try with sample data"** button (`/api/sample` → `createDemoSession`) keeps showing
  the legacy sample data — `createDemoSession` is untouched (shared helper).
- Onboarding (`seedDemoForRegion`) — unchanged.
- The dashboard/matches "No emails yet" empty state (for expired/no session) — unchanged (main's
  behavior); login is the entry that seeds.
- Matches are loaded as-is from the seed (not recomputed); the frozen clock (`lib/clock.ts`) already
  drives freshness in `DEMO_MODE`.

## Why not a separate `/api/demo/enter` route

An earlier draft added a dedicated entry route + login redirect. But `main` already auto-seeds on
login (#611), so a parallel route would double-create sessions and conflict. Reusing the #611 seam
is smaller, conflict-free, and keeps one demo-entry path.

## Testing / acceptance

- Unit: `buildDemoSessionBlob` maps emails/parsed_results/matches correctly; survives malformed
  `result_json` (`lib/demo-mode/__tests__/hydrate-demo-session.test.ts`).
- Integration: `POST /api/auth/login` in `DEMO_MODE` hydrates via `hydrateDemoSession`, sets
  `session_id` + `csrf_token`; does neither on failed login or when `DEMO_MODE` is unset
  (`__tests__/api/auth-login-demo-mode.test.ts`).
- Acceptance: after the password gate, `/dashboard` + `/matches` show the frozen snapshot
  (≥120 matches), dates frozen at 2026-05-28; legacy sample button still works; suite + `tsc` green.
- Prod verify (post-deploy): log in → dashboard populated with the anonymized corpus; PII spot-check.

## Constraints

Branch off `main`; PR; CI green; **squash-merge** (Rule #14). `data/demo-seed.db` is gitignored +
already on prod. Prod `.env.local` already has `DEMO_MODE=true` + `SESSIONS_DB_PATH=data/demo-seed.db`.
