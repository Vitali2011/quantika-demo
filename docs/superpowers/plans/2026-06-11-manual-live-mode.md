# Manual Live-Mode for Fresh Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Before using any Next.js/React API introduced or changed after v14 — WebFetch the relevant nextjs.org / react.dev docs page first.** This repo is Next.js 16 + React 19; model memory of Next 14/15 is not the source of truth here.

**Goal:** Let a broker log in with Gmail on a dedicated **live** deployment and run the real pipeline (fetch → classify → parse → match) against fresh email, while the public demo (`demo.quantika.org`, `DEMO_MODE=true`) keeps serving the frozen seed untouched.

**Architecture:** Run a **second systemd instance** (`quantika-live`) from the *same* build artifact on a separate port, with its own `EnvironmentFile` (`DEMO_MODE=false`, `SESSIONS_DB_PATH=data/live.db`, `MATCHES_ENABLED=true`), proxied by an nginx vhost `live.quantika.org`. No code change touches the demo path; full DB isolation; independent restart/rollback. On top of the infra split, three small code/docs hardening fixes (G6, G7, G5 from recon) close silent-failure and undocumented-dependency gaps.

**Tech Stack:** Next.js 16 / React 19, systemd, nginx, SQLite (`better-sqlite3`), Gmail OAuth, Gemini (`AI_PROVIDER=gemini` in prod).

**Recon source of truth:** `~/orchestrator-state/quantika-demo/recon/recon-fresh-mail-readiness.md` (gap table G1–G7 with file:line).

---

## Scope

**In scope (this plan / this PR is the plan doc only — tasks below are executed in a *later* PR after founder sign-off):**
- (А) Architecture decision for demo/live split — **recommendation + rationale** (Decision section, no code).
- (Б) G6 — make the `accountId` silent-fail **loud** (`app/api/auth/google/route.ts:28-35`, `app/api/emails/fetch/route.ts:48-55`).
- (Б) G7 — document `MATCHES_ENABLED` in `.env.local.example`.
- (Б) G5 — document the ClipProxy dependency (`.env.local.example`, comment near `lib/constants.ts:41`).

**Explicitly OUT of scope:**
- **G1 / G2** (the two L-size gaps): turning off `DEMO_MODE` globally in the demo instance, or building IMAP/Push/cron auto-ingest. The architecture decision *avoids* G1 (second instance, not a global flag flip) and *defers* G2 (manual OAuth pull only — no server-initiated fetch).
- **G3** (`lib/jobs/process-email.ts` stub) — dead code, not on the OAuth happy path.
- **G4** (`/api/parser/email` parse-only) — assessed below as **follow-up**, see Decision §D4.
- Any **production write** (live DB, prod OAuth app config, nginx/systemd changes on the VPS) — **founder go required**, see Founder Dependencies.

---

## Decision §A — Demo/Live Split Architecture

Three options were considered against the VPS reality (single host `outreach-vps`, systemd unit `quantika-demo` on port 3000, staged build + atomic swap deploy per #940, `NEXT_PUBLIC_*` baked at build time, demo data in `data/demo-seed.db`).

### Option 1 — Second systemd instance (RECOMMENDED)

A new unit `quantika-live` with `WorkingDirectory=/root/quantika-demo` (the *same* swapped build dir the demo uses), listening on a new port (proposal: **3001**), with its own `EnvironmentFile=/root/quantika-live.env`:

```
DEMO_MODE=false
SESSIONS_DB_PATH=data/live.db
MATCHES_ENABLED=true
# plus the same AI_PROVIDER=gemini + Gmail OAuth creds as demo
```

nginx vhost `live.quantika.org` → `proxy_pass http://localhost:3001`.

**Why this wins for our VPS:**
- **Zero code change on the demo path.** `isDemoMode()` is a process-global read (`lib/demo-mode.ts:9`); the demo process keeps `DEMO_MODE=true` and is byte-for-byte unaffected. G1 (an L-size gap) is sidestepped entirely — we never flip the demo flag.
- **Full DB isolation.** `SESSIONS_DB_PATH=data/live.db` ≠ `data/demo-seed.db`. Recon §4 flags that demo and live sessions are *not* isolated when they share a DB; separate files remove that risk. A live-pipeline bug cannot corrupt the frozen demo seed.
- **One build artifact, two services.** `DEMO_MODE` / `SESSIONS_DB_PATH` / `MATCHES_ENABLED` are **runtime** env (read per-request / at DB-open), not `NEXT_PUBLIC_*` baked values. So the existing `npm run build` output is reused — no separate build needed. The deploy script's atomic swap already lands one `/root/quantika-demo`; we add a second `systemctl restart quantika-live` after the swap.
- **Independent lifecycle.** Restart, `journalctl`, and rollback are per-unit. Demo uptime is decoupled from live experiments.

**Known caveat (cosmetic, accept + follow-up):** `NEXT_PUBLIC_APP_URL=https://demo.quantika.org` is baked into the shared bundle, so on `live.quantika.org` any client code that reads that constant points at the demo host. OAuth redirect is **not** affected — `app/api/auth/google/route.ts:38` derives the base URL from the request via `getRequestBaseUrl(request)`, not from the baked env. Impact is limited to analytics/canonical-URL cosmetics. If a `NEXT_PUBLIC_*` value *must* differ for live, that forces a separate build artifact — track as a follow-up, not part of MVP.

### Option 2 — Same instance, per-request demo/live mode

Rejected. `isDemoMode()` is a global env read, not per-session. Making mode per-request means refactoring every `isDemoMode()` call site (G1 is rated **L** precisely because of this blast radius) **and** demo + live would still share one `SESSIONS_DB_PATH` (recon §4) — a live bug could write into `demo-seed.db`. High risk to the demo, large diff, no isolation. Not worth it.

### Option 3 — Subdomain `live.quantika.org`

Not an alternative — it's the *routing half* of Option 1. The subdomain is **how brokers reach** the live instance; the second systemd unit is **what serves** it. Adopted as part of the recommendation.

### Recommendation

**Option 1 + Option 3:** second `quantika-live` systemd unit on port 3001, isolated `live.db`, nginx vhost `live.quantika.org` → :3001, reusing the demo build artifact. Minimal blast radius, full data isolation, no demo code change.

> The systemd-unit / nginx / `.env` provisioning on the VPS is **founder-gated infra** (see Founder Dependencies) and is intentionally *not* a code task in this plan — it is an ops runbook the founder executes. The code tasks below (G6/G7/G5) are the only repo changes.

### Decision §D4 — G4 (`/api/parser/email` parse-only): FOLLOW-UP, not in scope

`/api/parser/email` parses a single pasted email and returns `{cargo_type, load_port, discharge_port, laycan}` without writing to `session.parsedCargos` or triggering matching (`app/api/parser/email/route.ts:50-67`), and is blocked by `isDemoMode()`.

**The manual-live-mode happy path does not use it.** The broker flow is OAuth login → `POST /api/emails/fetch` → classify → `POST /api/ai/parse-cargo` / `parse-vessel` → match. That path **already** writes to the session and auto-triggers matching when `MATCHES_ENABLED=true` (recon §2 steps 3–5, §5). G4 only affects the separate "paste one email" UX, which is not required for live pipeline operation.

**Verdict:** defer. Wiring the paste endpoint into session + matching is an independent feature with its own UX surface; bundling it here would expand scope without unblocking the live flow. Revisit if brokers ask for ad-hoc single-email paste on the live instance.

---

## Founder Dependencies (BLOCKING — explicit go required)

These cannot proceed without the founder:

1. **Gmail OAuth credentials for the prod/live account.** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` plus an **authorized redirect URI** registered in the Google Cloud OAuth client for `https://live.quantika.org/api/auth/google`. Without the registered redirect URI, OAuth login fails on the live host.
2. **Any production write = explicit founder go.** This includes: creating `quantika-live.env` on the VPS, adding/starting the `quantika-live` systemd unit, the nginx vhost, and the *first* live OAuth login that writes real broker email into `data/live.db`. The plan's code tasks (G6/G7/G5) are merge-safe and demo-neutral, but **no live instance is stood up and no real email is fetched until the founder says go.**
3. **Live-instance test data.** First real fetch pulls a broker's actual inbox — confirm the broker account and consent before the first live run.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `app/api/auth/google/route.ts` | Modify `:28-35` | G6 — set a session degradation flag + escalate log when `fetchGmailProfile` yields no `accountId`. |
| `app/api/emails/fetch/route.ts` | Modify `:48-55`, `:57-60` | G6 — surface `cacheDisabled: true` in the fetch response + warn-log when `accountId` is absent (instead of silently skipping persistence). |
| `lib/session.ts` (or wherever `Session` type lives) | Modify | G6 — add optional `accountDegraded?: boolean` to the session shape. |
| `.env.local.example` | Modify | G7 — document `MATCHES_ENABLED`; G5 — document ClipProxy (`CLIPROXY_BASE_URL` / `CLIPROXY_API_KEY`) as required infra when `AI_PROVIDER=openai`. |
| `__tests__/emails-fetch-cache-disabled.test.ts` | Create | G6 — behavioral test: missing `accountId` → response has `cacheDisabled: true`. |
| `__tests__/env-example-docs.test.ts` | Create | G7 — assert `MATCHES_ENABLED` documented in `.env.local.example`. |

> Before Task 1, confirm the exact location of the `Session` type and the `updateSession` signature with: `grep -rn "accountId" lib/session*.ts lib/types*.ts`. Follow the existing field-naming convention in that file.

---

## Task 1: G6 — make the `accountId` silent-fail loud

**Files:**
- Modify: `app/api/auth/google/route.ts:28-35`
- Modify: `app/api/emails/fetch/route.ts:48-55`
- Modify: `lib/session.ts` (add `accountDegraded?: boolean` to `Session`)
- Test: `__tests__/emails-fetch-cache-disabled.test.ts`

**Behavior goal:** keep login working (OAuth token is still valid without a profile), but make the degraded state **observable** — a structured warn-level log, a session flag, and a machine-readable `cacheDisabled` field in the fetch response so the UI can show a "cache disabled" banner. No silent skip.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/emails-fetch-cache-disabled.test.ts
import { POST } from '@/app/api/emails/fetch/route';
import { NextRequest } from 'next/server';

// Mock session WITHOUT accountId, not sample data, not demo mode.
jest.mock('@/lib/demo-mode', () => ({ isDemoMode: () => false }));
jest.mock('@/lib/google', () => ({
  fetchGmailEmails: async () => [{ id: 'm1', subject: 's', body: 'b', from: 'a@b.c' }],
}));
jest.mock('@/lib/session', () => ({
  getSession: () => ({ accessToken: 'tok', isSampleData: false, emails: [], accountId: undefined }),
  updateSession: jest.fn(),
}));

function reqWithSession(): NextRequest {
  const r = new NextRequest('http://localhost/api/emails/fetch', { method: 'POST' });
  r.cookies.set('session_id', 'sess-1');
  return r;
}

test('fetch with no accountId reports cacheDisabled: true', async () => {
  const res = await POST(reqWithSession());
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.cacheDisabled).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --findRelatedTests app/api/emails/fetch/route.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `body.cacheDisabled` is `undefined`.

- [ ] **Step 3: Add the session flag type**

In `lib/session.ts`, add to the `Session` interface (place beside `accountId`):

```typescript
  /** Set when Gmail profile lookup failed → email/parse cache is disabled for this session. */
  accountDegraded?: boolean;
```

- [ ] **Step 4: Make the profile-fetch failure loud in the OAuth route**

In `app/api/auth/google/route.ts`, replace the `try/catch` body at `:28-35`:

```typescript
    try {
      const accountId = await fetchGmailProfile(accessToken);
      if (accountId) {
        updateSession(sessionId, { accountId });
      } else {
        // Loud, not silent: no accountId → cache layer is disabled for this session.
        logger.warn({ sessionId }, 'Gmail profile returned no accountId — email/parse cache disabled');
        updateSession(sessionId, { accountDegraded: true });
      }
    } catch (err) {
      // Non-fatal for login (OAuth token is still valid) but must be observable.
      logger.error({ err, sessionId }, 'Gmail profile fetch failed — email/parse cache disabled');
      updateSession(sessionId, { accountDegraded: true });
    }
```

- [ ] **Step 5: Surface `cacheDisabled` in the fetch response**

In `app/api/emails/fetch/route.ts`, change the `accountId` block at `:48-55` and the success response at `:57-60`:

```typescript
    const cacheDisabled = !session.accountId;
    if (session.accountId) {
      try {
        upsertEmails(session.accountId, truncatedEmails);
      } catch (err) {
        logger.error({ err }, 'Email persistence (upsertEmails) failed');
      }
    } else {
      // Loud: surface the degraded state instead of skipping in silence.
      logger.warn({ sessionId }, 'No accountId on session — emails not persisted (cache disabled)');
    }

    return NextResponse.json({
      count: truncatedEmails.length,
      message: `Loaded ${truncatedEmails.length} emails`,
      cacheDisabled,
    });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest --findRelatedTests app/api/emails/fetch/route.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 1 passed`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no new errors referencing the edited files.

- [ ] **Step 8: Commit**

```bash
git add app/api/auth/google/route.ts app/api/emails/fetch/route.ts lib/session.ts __tests__/emails-fetch-cache-disabled.test.ts
git commit -m "fix(live): surface accountId degradation instead of silent cache skip (G6)"
```

> **UI follow-up (out of this task, note for executor):** a `cacheDisabled` banner on `/processing` consuming the new response field is a small frontend add — list it as a follow-up, don't expand this task.

---

## Task 2: G7 — document `MATCHES_ENABLED` in `.env.local.example`

**Files:**
- Modify: `.env.local.example`
- Test: `__tests__/env-example-docs.test.ts`

**Why:** the background auto-match after parse is gated on `process.env.MATCHES_ENABLED === 'true'` (`app/api/ai/parse-cargo/route.ts:227`, mirror in `parse-vessel/route.ts:147`), but the var is absent from `.env.local.example`. The live instance needs it set to `true`; an undocumented flag means a silently match-less live pipeline.

- [ ] **Step 1: Pre-removal/insertion grep (discovery, confirm current state)**

```bash
grep -n "MATCHES_ENABLED" .env.local.example   # expect: no output (gap confirmed)
grep -rn "MATCHES_ENABLED" app/ lib/           # expect: parse-cargo + parse-vessel routes + compute-matches
```

- [ ] **Step 2: Write the failing test**

```typescript
// __tests__/env-example-docs.test.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const env = readFileSync(join(process.cwd(), '.env.local.example'), 'utf8');

test('MATCHES_ENABLED is documented in .env.local.example', () => {
  expect(env).toMatch(/^#.*MATCHES_ENABLED/m); // a doc comment line
  expect(env).toMatch(/^MATCHES_ENABLED=/m);   // a default value line
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest __tests__/env-example-docs.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — no `MATCHES_ENABLED` line.

- [ ] **Step 4: Add the documentation block**

Append to `.env.local.example` (near the other feature flags):

```bash
# MATCHES_ENABLED — gates the background auto-match that runs after cargo/vessel
# parse (app/api/ai/parse-cargo/route.ts, parse-vessel/route.ts). When "true",
# computeAndPersistMatches() writes the main-bucket matches to the matches table.
# Required = true on the live instance; the explicit POST /api/ai/match path is
# always available regardless of this flag.
MATCHES_ENABLED=false
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/env-example-docs.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 1 passed`.

- [ ] **Step 6: Commit**

```bash
git add .env.local.example __tests__/env-example-docs.test.ts
git commit -m "docs(env): document MATCHES_ENABLED auto-match flag (G7)"
```

---

## Task 3: G5 — document the ClipProxy dependency

**Files:**
- Modify: `.env.local.example` (expand the existing `CLIPROXY_*` lines with a comment)
- Modify: `lib/constants.ts:41-42` (clarifying comment only — no behavior change)

**Why:** the default provider chain resolves `AI_PROVIDER=openai` to requests against `CLIPROXY_BASE_URL` (`http://localhost:8317/v1`, `lib/constants.ts:41`, `lib/openai.ts:6-7`). Without a running ClipProxy holding a real upstream key, every OpenAI-scope LLM call fails. The example file lists the keys as bare placeholders with no explanation. Prod uses `AI_PROVIDER=gemini`, but anyone running the OpenAI path locally or on the live box hits this silently.

- [ ] **Step 1: Confirm current example state**

```bash
grep -n "CLIPROXY" .env.local.example lib/constants.ts
```
Expected: `CLIPROXY_API_KEY` / `CLIPROXY_BASE_URL` present in both, no explanatory comment.

- [ ] **Step 2: Add the documentation comment to `.env.local.example`**

Replace the bare `CLIPROXY_*` lines (`.env.local.example:3-4`) with:

```bash
# ClipProxy — REQUIRED INFRA when AI_PROVIDER=openai. OpenAI-scope LLM calls are
# routed to this local proxy (lib/openai.ts), NOT api.openai.com. Without a running
# ClipProxy that holds a valid upstream key, every OpenAI-scope call fails. Prod
# uses AI_PROVIDER=gemini and does not need this. Default base URL is localhost:8317.
CLIPROXY_API_KEY=cliproxy-key-1
CLIPROXY_BASE_URL=http://localhost:8317/v1
```

- [ ] **Step 3: Add a clarifying comment in `lib/constants.ts`**

Above `:41`:

```typescript
// ClipProxy is the OpenAI-compatible proxy used for AI_PROVIDER=openai (see lib/openai.ts).
// Required infra for the OpenAI path; not used when AI_PROVIDER=gemini. See .env.local.example.
export const CLIPROXY_BASE_URL = process.env.CLIPROXY_BASE_URL || 'http://localhost:8317/v1';
```

- [ ] **Step 4: Typecheck (comment-only change, sanity)**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add .env.local.example lib/constants.ts
git commit -m "docs: document ClipProxy as required infra for AI_PROVIDER=openai (G5)"
```

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Live instance shares `data/demo-seed.db` by misconfiguration → corrupts the frozen demo | Low | `SESSIONS_DB_PATH=data/live.db` in `quantika-live.env`; verify with `journalctl -u quantika-live` on first boot that it opened `live.db`. Founder-gated provisioning. |
| Baked `NEXT_PUBLIC_APP_URL` points at demo host on the live subdomain | Certain (cosmetic) | OAuth redirect uses `getRequestBaseUrl(request)`, unaffected. Cosmetic only; separate build is a follow-up if a client flag must truly differ. |
| OAuth redirect URI for `live.quantika.org` not registered in Google Cloud | Medium | Founder Dependency #1 — register before first login. |
| G6 change alters the fetch response shape and breaks an existing consumer | Low | Added field is additive (`cacheDisabled`); grep consumers of the fetch response before merge (Pre-PASS Block 3). |
| Second systemd unit competes for VPS RAM (12 GB) with demo + build | Low | Live instance is low-traffic (single broker); monitor `systemctl status`. Reuses the same Node build, no extra build memory. |

## Rollback

- **Code (G6/G7/G5):** standard `git revert <sha>` per task; all three are additive and demo-neutral. No migration, no data change.
- **Infra (live instance):** `systemctl stop quantika-live && systemctl disable quantika-live`; remove the nginx vhost; the demo instance (`quantika-demo` on :3000) is entirely independent and never touched, so demo has nothing to roll back. `data/live.db` can be deleted without affecting demo.

## Readiness Criteria

**Plan (this PR):**
- [ ] Plan doc reviewed and approved by founder (architecture recommendation + scope).

**Code tasks (later PR, after founder go):**
- [ ] G6: fetch response returns `cacheDisabled: true` when `accountId` absent; warn-log emitted; `accountDegraded` set on session. Behavioral test green.
- [ ] G7: `MATCHES_ENABLED` documented; doc test green.
- [ ] G5: ClipProxy documented in `.env.local.example` + `lib/constants.ts`.
- [ ] `npx tsc --noEmit` clean; affected jest suites green (`--maxWorkers=1`).

**Live instance (founder-executed ops, after go):**
- [ ] `quantika-live` unit boots, `journalctl -u quantika-live` confirms `DEMO_MODE=false` and `live.db` opened.
- [ ] `live.quantika.org` OAuth login succeeds (redirect URI registered).
- [ ] Fetch → classify → parse → match runs end-to-end on a real inbox; matches persist to `live.db`.
- [ ] `demo.quantika.org` unchanged: still serves frozen seed, `data/demo-seed.db` untouched (verify mtime).

---

## Self-Review

- **Spec coverage:** (А) Decision §A covers the three architecture options + recommendation. (Б) Tasks 1–3 cover G6/G7/G5. (В) Decision §D4 assesses G4 as follow-up with rationale. (Г) Founder Dependencies section lists OAuth creds + prod-write gate explicitly. ✔
- **Placeholder scan:** no TBD/TODO; all code steps show concrete code. ✔ (UI banner is explicitly flagged as out-of-task follow-up, not a placeholder inside a task.)
- **Type consistency:** `accountDegraded?: boolean` added in Task 1 Step 3, used in Steps 4–5; `cacheDisabled` response field consistent across the test and the route. ✔
