# Wave B — Demo session durability (#790)

**Branch off `origin/main`.** Part of the 2026-06-03 QA-matches program. Tier M, **risk-override** (session/auth request path) → mandatory `/test-skill` + verify `lib/__tests__/session-expiry.test.ts`. File-independent of Wave A1 (different subsystem).

## Goal

Demo data must NOT vanish mid-session. An investor clicking through the demo for >1h (or starting partway into the session's hour) currently sees `/matches` + `/dashboard` drop to "📭 No emails yet". Make the demo session self-heal so navigation always shows data.

## Root cause (traced + confirmed on live prod)

- `SESSION_TTL_MS = 1h` hardcoded (`lib/constants.ts:62`); `getSession()` DELETEs the row + returns null once expired (`lib/session-store.ts:139-142`). Store is SQLite-backed (survives restart) — NOT in-memory/LRU as the QA hypothesis guessed.
- Auth gate uses a **separate, longer cookie**: `demo_auth` lives `DEMO_AUTH_COOKIE_DAYS` = **30 days on prod** (`lib/auth/config.ts:20`). So after 1h, `demo_auth` is still valid → middleware does NOT redirect → page reaches render → `getSession()` null → empty state (`app/matches/page.tsx:22-35`, `app/dashboard/page.tsx:26-44`).
- `hydrateDemoSession` runs **only at login** (`app/api/auth/login/route.ts:87`) — no read-path re-seed → stuck empty until re-login.
- Prod confirms: `DEMO_AUTH_COOKIE_DAYS=30`, `DEMO_MODE=true`, `SESSIONS_DB_PATH=data/demo-seed.db`.

## Fix (recommended design — re-hydrate-on-empty + lifetime align)

1. **Re-hydrate-on-empty (primary, robust).** Under `DEMO_MODE`, when `demo_auth` is valid but the session is null/expired, recreate + hydrate a demo session from the durable seed rows (`user_id IS NULL` via `buildDemoSessionBlob`, `lib/demo-mode/hydrate-demo-session.ts:100-102`) and set the `session_id` cookie. **Server Components cannot set cookies** → implement in `middleware.ts` (~line 188, where it already handles demo_auth ~166-169) or a route handler, NOT in `page.tsx`. Result: any navigation self-heals.
2. **Align lifetimes (defense-in-depth).** Make the demo session TTL ≥ the auth-cookie lifetime so data never outlives the gate: `SESSION_TTL_MS` (`lib/constants.ts:62`) and the `Max-Age=3600` session_id cookie at `app/api/auth/login/route.ts:96,111`. Prefer env-configurable; in demo mode default ≥ `DEMO_AUTH_COOKIE_DAYS`.
3. Keep the non-demo (OAuth) session path semantics unchanged.

## Out of scope (flag, don't fix here)

- **Shared-file hazard**: `SESSIONS_DB_PATH = data/demo-seed.db` means sessions + seed snapshot share one file; a prod re-seed swapping that file under the open SQLite handle can evict live sessions (a _second_ #790 failure mode). The re-hydrate-on-empty fix mitigates the symptom; the safe-swap procedure belongs to **Wave C5** (seed-apply: checkpoint/atomic-swap). Document the dependency.
- All matching/display/economics content (other waves).

## Verification (required)

1. A failing-first test: simulate an expired/missing demo session mid-navigation → assert the page re-hydrates (data present), not the empty state. (TDD: RED → GREEN.)
2. `npm test` green incl. `lib/__tests__/session-expiry.test.ts` (confirm OAuth path unaffected); `npx tsc --noEmit` clean.
3. Cold `/test-skill` (risk-override) — emit `<<TESTSKILL=PASS|FAIL findings=N>>`.
4. `git status --porcelain` clean.

- Live 1h-expiry is impractical to wall-clock in preview → prove via the forced-expiry test + read the re-hydrate code path. Note in the PR that prod acceptance = founder leaves the demo open / navigates after a while and data persists.

## Notes

- Auto-PR to main on QA PASS. Deploy-affecting? `middleware.ts` + session lifetime = behavioral; notify founder post-merge (Rule #9) and include a prod acceptance step (Rule #20).
