# Audit Report — quantika-demo (2026-04-15)

> Canonical reference for all remediation specs (spec-02–spec-N). Do not modify findings, IDs, or priorities — they are ground truth.

---

## Executive Summary

Quantika-demo is a Next.js 14 AI freight-email triage product. The codebase is functionally solid — OAuth flows correctly, no hardcoded secrets, no XSS vectors, AI pipeline works end-to-end. Core risks are **operational**: sessions are in-memory only (data lost on restart), TypeScript build errors are silently suppressed (`ignoreBuildErrors: true`), test coverage is 1.4% (1 file, 8 tests across ~70 source files), and there is no CI. Four npm HIGH vulnerabilities and zero error tracking round out the picture. This is not a failing system — it is a pre-production system that needs foundation work before handling real user load.

---

## Metrics

| Metric | Value |
|--------|-------|
| LOC (app + lib + components) | ~5 625 |
| Source files | ~70 |
| Test files | **1** (`lib/__tests__/currency.test.ts`) |
| Test coverage | ~1.4% |
| Direct npm dependencies | ~20 |
| npm vulnerabilities | **5** (4 HIGH + 1 MODERATE) |
| TODO/FIXME/XXX/HACK | 0 |
| `: any` occurrences | **36** |
| `@ts-ignore` | 0 |
| `console.log` in source | 2 |
| API routes | 13 |
| Pages | 10 |

---

## Findings Index

| ID | Priority | Category | Title | Affected Files |
|----|----------|----------|-------|----------------|
| finding-001 | P1 | code-quality | Business logic mixed with UI on dashboard | `app/dashboard/page.tsx` |
| finding-002 | P1 | code-quality | UI helper duplication across 4 detail pages | `app/{fixture,match,cargo,vessel}/[id]/page.tsx` |
| finding-003 | P1 | code-quality | Parsing utility duplication across 3 AI routes | `app/api/ai/parse-{vessel,recap,cargo}/route.ts` |
| finding-004 | P1 | code-quality | 36 `: any` occurrences in TypeScript | `app/{cargo,fixture,vessel}/[id]/page.tsx`, parse routes |
| finding-005 | P2 | code-quality | Dead code exports in lib | `lib/session.ts`, `lib/counterparty.ts` |
| finding-006 | P2 | code-quality | Magic numbers without documentation | `lib/constants.ts:12-16` |
| finding-007 | P2 | code-quality | Sample data hardcoded in route (294 LOC) | `app/api/sample/route.ts` |
| finding-008 | P3 | code-quality | Detail pages 200–300 LOC each | `app/{cargo,fixture,vessel}/[id]/page.tsx` |
| finding-009 | P0 | reliability | Test coverage 1.4% | All files except `lib/__tests__/currency.test.ts` |
| finding-010 | P1 | reliability | Jest not configured for Next.js | `package.json`, missing `jest.config.*` |
| finding-011 | P1 | reliability | AI mocks may diverge from real API | `app/api/ai/*/route.ts` |
| finding-012 | P1 | observability | Near-zero mobile responsiveness | `app/{page,dashboard/page,*/[id]/page}.tsx` |
| finding-013 | P1 | observability | Minimal empty/loading/error states | `app/processing/page.tsx`, detail pages |
| finding-014 | P2 | observability | Zero accessibility (a11y) | Project-wide |
| finding-015 | P2 | observability | Generic non-actionable error messages | `app/processing/page.tsx`, AI routes |
| finding-016 | P3 | observability | Sample data button unexplained to user | `app/page.tsx` |
| finding-017 | P0 | security | Sessions in-memory only — lost on restart | `lib/session.ts:25` |
| finding-018 | P0 | security | No CSRF protection on mutating endpoints | All `app/api/ai/*/route.ts`, `app/api/sample/route.ts` |
| finding-019 | P1 | security | 5 npm vulnerabilities (4 HIGH + 1 MODERATE) | `package.json`, `package-lock.json` |
| finding-020 | P1 | security | `ignoreBuildErrors: true` hides TS errors | `next.config.mjs:4` |
| finding-021 | P2 | security | Debug `console.log` leaks commission data | `app/api/ai/parse-recap/route.ts:102` |
| finding-022 | P1 | architecture | No error tracking (Sentry / equivalent) | Project-wide |
| finding-023 | P1 | architecture | No `/api/health` endpoint | Missing `app/api/health/route.ts` |
| finding-024 | P1 | architecture | No product analytics | Project-wide |
| finding-025 | P2 | architecture | No structured logging | Project-wide |
| finding-026 | P0 | architecture | No CI pipeline | Missing `.github/workflows/ci.yml` |
| finding-027 | P1 | architecture | README is generic Next.js template | `README.md` |
| finding-028 | P1 | architecture | Hardcoded path in `ecosystem.config.js` | `ecosystem.config.js:7` |
| finding-029 | P1 | architecture | No rollback procedure documented | `docs/deploy.md` |
| finding-030 | P2 | architecture | No Dockerfile | Missing `Dockerfile` |

**P0 findings: finding-009, finding-017, finding-018, finding-026**

---

## Remediation Roadmap

### Wave 1 — Foundation (P0 must-fix before team development)

Goal: stop silently dropping prod errors and establish baseline checks.

| Spec | Finding | Title |
|------|---------|-------|
| spec-001 | finding-020 | Remove `ignoreBuildErrors`, fix all TS errors |
| spec-002 | finding-019 | `npm audit fix` + bump `eslint-config-next` |
| spec-003 | finding-018 | CSRF protection on `/api/ai/*` and `/api/sample` |

### Wave 2 — Reliability (safe to change code, survive restart)

Goal: persistent sessions, deduplicated code, test foundation.

| Spec | Finding | Title |
|------|---------|-------|
| spec-004 | finding-017 | Persistent sessions via SQLite (`better-sqlite3`) |
| spec-005 | finding-002 + 003 | Extract duplicated helpers to `lib/` |
| spec-006 | finding-009 + 010 | Jest setup for Next.js + 30+ tests on session/parsing/API |

### Wave 3 — Observability (visibility and automation)

Goal: know what happens in prod, block regressions on PR.

| Spec | Finding | Title |
|------|---------|-------|
| spec-007 | finding-022 + 023 | `/api/health` + structured logging + Sentry |
| spec-008 | finding-026 | GitHub Actions CI (lint + test + audit + build) |

### Waves 4–7 — Backlog

**Wave 4 — UX** *(after Wave 3 — safe to touch UI with tests in place)*
- finding-012 [P1]: Mobile responsiveness — 3 breakpoint usages across 10 pages
- finding-013 [P1]: Per-step loading/error states with skeleton loaders
- finding-014 [P2]: Semantic HTML + `aria-*` + keyboard navigation
- finding-015 [P2]: Actionable error messages (Gmail rate limit, AI unavailable)

**Wave 5 — Refactor** *(strictly after spec-006 test foundation)*
- finding-001 [P1]: Extract dashboard logic to `lib/dashboard-queries.ts`
- finding-004 [P1]: Replace 36 `: any` with `unknown` + type guards
- finding-007 [P2]: Move sample mocks from route to `lib/sample-data/*.json`
- finding-008 [P3]: Split detail pages from ~250 LOC to ≤120 LOC + components

**Wave 6 — Ops** *(trigger: staging environment or second prod node)*
- finding-030 [P2]: Multi-stage Dockerfile + docker-compose for local dev
- finding-029 [P1]: Rollback procedure in `docs/deploy.md`
- finding-024 [P1]: PostHog/Mixpanel product analytics
- finding-028 [P1]: Replace hardcoded `/root/quantika-demo` in `ecosystem.config.js`

**Wave 7 — Polish** *(quiet sprint, good onboarding task)*
- finding-027 [P1]: Rewrite README with setup, architecture diagram, env vars
- finding-005 [P2]: Remove dead exports; add ESLint `no-unused-exports`
- finding-006 [P2]: JSDoc on magic numbers in `lib/constants.ts`
- finding-021 [P2]: Remove debug `console.log` from `parse-recap/route.ts:102`

---

## Full Findings Detail

### Code Quality (findings 001–008)

**finding-001 [P1]** — `app/dashboard/page.tsx`
Problem: 571-line component combines session loading, email filtering, status grouping, freshness checks, and full UI render.
Action: Extract grouping/filtering logic to `lib/dashboard-queries.ts`; page target ≤200 LOC.

**finding-002 [P1]** — `app/{fixture,match,cargo,vessel}/[id]/page.tsx`
Problem: Functions `safeRender`, `getConf`, and component `ConfIcon` copy-pasted into 4 files (~120 LOC duplication).
Action: Create `lib/ui-render.ts`, import in all 4 pages.

**finding-003 [P1]** — `app/api/ai/parse-{vessel,recap,cargo}/route.ts`
Problem: `extractNum()` and `toConfidence<T>()` duplicated in 3 AI routes — silent divergence risk.
Action: Consolidate into `lib/parsing-utils.ts`.

**finding-004 [P1]** — detail pages, parse routes
Problem: 36 explicit `: any` occurrences — TypeScript provides zero protection at these callsites.
Action: Replace with `unknown` + type narrowing; target <10, rest with explicit `as unknown as X` comment.

**finding-005 [P2]** — `lib/session.ts`, `lib/counterparty.ts:23`
Problem: `getSessionCount` and `groupByCounterparty` exported but never called.
Action: Delete dead exports; add ESLint `no-unused-exports` rule.

**finding-006 [P2]** — `lib/constants.ts:12-16`
Problem: 5 numeric constants (revenue thresholds, TTL) with no explanation of origin.
Action: Add JSDoc comments or move to config with source reference.

**finding-007 [P2]** — `app/api/sample/route.ts:6-272`
Problem: 294 LOC of hardcoded freight email mocks inside the route handler.
Action: Move to `lib/sample-data/*.json`; route only loads and returns them.

**finding-008 [P3]** — `app/{cargo,fixture,vessel}/[id]/page.tsx`
Problem: Three detail pages at 230–290 LOC each with multi-stage conditional rendering.
Action: After finding-002 deduplication, split into reusable `components/` cards; each page ≤120 LOC.

---

### Reliability (findings 009–011)

**finding-009 [P0]** — all source files except `lib/__tests__/currency.test.ts`
Problem: 1.4% test coverage — 8 tests across ~70 files; 0 tests on sessions, API routes, or parsing.
Action: Set up Jest under Next.js (finding-010 first); write 30–40 tests targeting session, parsing, 2 key API routes; target 30% coverage.

**finding-010 [P1]** — `package.json`, missing `jest.config.*`
Problem: Jest and ts-jest present in `package.json` but no `jest.config.mjs` with `next/jest` setup or `@/` path aliases. Tests would fail to import Next.js modules.
Action: Create `jest.config.mjs` using `next/jest`; configure module name mapper; add RTL and AI/Gmail mocks.

**finding-011 [P1]** — `app/api/ai/*/route.ts`
Problem: No recorded real API response fixtures — future mocks risk encoding a format that diverges from ClipProxy production responses.
Action: Record 5–10 real AI responses in `__fixtures__/`; use in parsing tests. Tackle in tandem with finding-009.

---

### Observability / UX (findings 012–016)

**finding-012 [P1]** — `app/{page,dashboard/page,*/[id]/page}.tsx`
Problem: Only 3 Tailwind breakpoint usages (`sm:/md:/lg:`) project-wide; main pages break on mobile.
Action: Make dashboard and detail pages functional at 375px+.

**finding-013 [P1]** — `app/processing/page.tsx:194-205`, detail pages
Problem: One generic error state across a 7-step sequential AI pipeline; no per-step feedback; no skeleton loaders.
Action: Per-step error with human-readable message; skeleton loaders on detail pages.

**finding-014 [P2]** — project-wide
Problem: Zero `aria-*` attributes; clickable `<div onClick>` instead of `<button>`; no focus states.
Action: Semantic HTML, `aria-label` on icon buttons, keyboard-accessible navigation.

**finding-015 [P2]** — `app/processing/page.tsx`, AI routes
Problem: Errors surface as generic "Step failed / Try again" — user cannot determine cause or fix.
Action: Map error codes to actionable messages ("Gmail rate limit — wait 5 min", "AI service unavailable").

**finding-016 [P3]** — `app/page.tsx`
Problem: "Sample data" button has no explanation of what it does vs. Gmail connection.
Action: Add tooltip "Try with 19 pre-loaded freight emails — no Gmail login needed".

---

### Security (findings 017–021)

**finding-017 [P0]** — `lib/session.ts:25`
Problem: `sessionStore` is a `Map<sessionId, SessionData>` in process memory, TTL 1 hour. Any PM2 restart erases all user work with no recovery path.
Action: Replace with SQLite-backed store via `better-sqlite3`; schema persists across restarts.

**finding-018 [P0]** — all `app/api/ai/*/route.ts`, `app/api/sample/route.ts`
Problem: All POST routes authenticate via session cookie only — no CSRF token. Attacker can trigger OpenAI calls on user's account from a third-party page. `/api/sample` uses GET, creating a session on link click.
Action: Implement double-submit cookie CSRF pattern; require `X-CSRF-Token` header on all state-changing requests.

**finding-019 [P1]** — `package.json`, `package-lock.json`
Problem: `npm audit` reports 4 HIGH (`glob` CWE-78 command injection, `@next/eslint-plugin-next`, `eslint-config-next`, `next` advisories) and 1 MODERATE (`@hono/node-server` path traversal).
Action: `npm audit fix`; upgrade `eslint-config-next` to 16.2.3+; verify no breaking changes.

**finding-020 [P1]** — `next.config.mjs:4`
Problem: `typescript: { ignoreBuildErrors: true }` — production build succeeds regardless of TypeScript errors.
Action: Remove flag; fix all surfaced TS errors; CI fails on type errors going forward.

**finding-021 [P2]** — `app/api/ai/parse-recap/route.ts:102`
Problem: `console.log("[RECAP] commissionPercent values:", ...)` writes commercially sensitive commission data to PM2 stdout.
Action: Remove or gate behind `process.env.DEBUG`.

---

### Architecture & Operations (findings 022–030)

**finding-022 [P1]** — project-wide
Problem: No error tracking integration; only `console.error` in 2 places; failures discovered via user reports.
Action: Integrate Sentry (or equivalent); capture unhandled rejections and Next.js API route errors.

**finding-023 [P1]** — missing `app/api/health/route.ts`
Problem: No HTTP health endpoint; PM2 only monitors the process, not actual HTTP responsiveness.
Action: `GET /api/health` → `{ status: 'ok', sessions: N, uptime: ms, version: '1.0.0' }`.

**finding-024 [P1]** — project-wide
Problem: Zero product analytics — no visibility into OAuth completion rate, pipeline drop-off, or feature usage.
Action: Integrate PostHog (or Mixpanel/GA); emit events: `oauth_start`, `processing_complete`, `dashboard_view`, `detail_open`.

**finding-025 [P2]** — project-wide
Problem: Plain `console.log/error` only — no request IDs, no latency, no structured format; debugging user-specific issues through PM2 logs is impractical.
Action: Adopt pino or winston; JSON-format logs; request-ID middleware.

**finding-026 [P0]** — missing `.github/workflows/ci.yml`
Problem: No CI pipeline — lint, tests, audit, and build are not checked on PRs; broken code merges on trust.
Action: GitHub Actions workflow: `npm run lint && npm test && npm audit && npm run build`; block merge on failure.

**finding-027 [P1]** — `README.md`
Problem: Contains the default Next.js template README — no setup instructions, no architecture overview, no env var list.
Action: Rewrite with: local setup steps, architecture diagram (`email→classify→parse→match→recap`), `.env.local` reference, test/sample-mode instructions.

**finding-028 [P1]** — `ecosystem.config.js:7`
Problem: `cwd: '/root/quantika-demo'` is hardcoded — prevents deployment to any other directory; blocks staging.
Action: Replace with `process.env.APP_DIR || '/root/quantika-demo'` and document convention.

**finding-029 [P1]** — `docs/deploy.md`
Problem: Deploy procedure documented; rollback not documented. First broken deploy at odd hours will mean improvised recovery.
Action: Add rollback section: `git checkout <previous-tag>` + `npm ci && npm run build && pm2 reload`.

**finding-030 [P2]** — missing `Dockerfile`
Problem: Bare-metal PM2 only — blocks migration to managed hosting (Fly.io, Railway, k8s) or local parallel environments.
Action: Multi-stage Dockerfile + docker-compose for local dev.
