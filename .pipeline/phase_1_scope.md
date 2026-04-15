## Spec Summary
- Create `GET /api/health` — unauthenticated endpoint
- Returns `{ status: 'ok', sessions: <count>, uptime: <seconds>, version: '0.1.0' }`
- No auth cookie required, HTTP 200, Content-Type: application/json
- `sessions` from `getSessionCount()` in `@/lib/session`
- `uptime` from `process.uptime()` rounded to 2 decimal places
- `version` as hardcoded const `'0.1.0'` (no JSON import to avoid bundler issues)
- ≥4 unit tests covering all fields, using `jest.mock('@/lib/session')`

## Affected Files
- `app/api/health/route.ts` — create new GET handler
- `app/api/health/__tests__/health.test.ts` — create ≥4 unit tests

## Boundaries
### Can Change:
- `app/api/health/route.ts` (new file)
- `app/api/health/__tests__/health.test.ts` (new file)

### Cannot Change:
- `lib/session.ts`, `lib/session-store.ts`, `package.json`, `package-lock.json`
- `next.config.mjs`, `middleware.ts`, `lib/csrf.ts`, `jest.config.mjs`, `jest.setup.ts`
- `lib/logger.ts`, sentry configs, `.env.local.example`

## Work Fronts
### Front 1: Health endpoint + tests
- Files: `app/api/health/route.ts`, `app/api/health/__tests__/health.test.ts`
- Scope: single front, no parallelization needed

## Overlap Check
Single front — no overlaps.

## Open Questions
None.
