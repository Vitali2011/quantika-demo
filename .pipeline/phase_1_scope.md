## Spec Summary (spec-10: Audit Fix)
- Запустить `npm audit fix` для автоматического устранения уязвимостей
- Обновить `eslint-config-next` до 16.2.3+ (мажорный бамп, breaking change)
- Вручную разрешить оставшиеся HIGH vulnerabilities
- `npm audit --audit-level=high` → 0 уязвимостей
- `npm run lint` и `npm run build` должны проходить
- Тесты `lib/__tests__/currency.test.ts` зелёные
- `package-lock.json` регенерировать через `npm install`

## Affected Files (spec-10)
- `package.json` → обновить eslint-config-next, возможно добавить overrides
- `package-lock.json` → регенерируется автоматически

## Current Audit State
HIGH (4):
- glob CWE-78 via eslint-config-next chain → fix: eslint-config-next@16.2.3
- next 14.2.35 (DoS CVEs: GHSA-9g9p, GHSA-h25m, GHSA-ggv3, GHSA-3x4c, GHSA-q4gf) → fix: next@16.2.3 (нарушает 14.x constraint!)

MODERATE (2):
- @hono/node-server <1.19.13 → npm audit fix
- hono <=4.12.11 → npm audit fix

## Boundaries (spec-10)
### Can Change:
- `package.json` — версии пакетов, раздел overrides
- `package-lock.json` — автоматически

### Cannot Change:
- `next.config.mjs`, `lib/csrf.ts`, `middleware.ts`, `app/api/**/route.ts`
- `.github/workflows/ci.yml`, `README.md`
- Next.js версия должна оставаться в 14.x (CONSTRAINT)

## Work Fronts (spec-10)
### Front 1: npm audit fix + eslint-config-next upgrade
- Files: `package.json`, `package-lock.json`
- Scope: npm audit fix, bump eslint-config-next@^16.2.3, npm install

## Open Questions (spec-10)
КОНФЛИКТ: next@14.2.35 имеет HIGH CVEs (DoS), которые фиксятся ТОЛЬКО в next@16.2.3.
Constraint требует 14.x. Решение: зафиксировать eslint-config-next → 0 из 4 HIGH,
для next HIGH использовать `overrides` в package.json чтобы форсировать безопасные
транзитивные deps где возможно, или задокументировать как known limitation 14.x constraint.

---

## Spec Summary (spec-11: Health Endpoint)
- Create `GET /api/health` — unauthenticated endpoint
- Returns `{ status: 'ok', sessions: <count>, uptime: <seconds>, version: '0.1.0' }`
- No auth cookie required, HTTP 200, Content-Type: application/json
- `sessions` from `getSessionCount()` in `@/lib/session`
- `uptime` from `process.uptime()` rounded to 2 decimal places
- `version` as hardcoded const `'0.1.0'` (no JSON import to avoid bundler issues)
- ≥4 unit tests covering all fields, using `jest.mock('@/lib/session')`

## Affected Files (spec-11)
- `app/api/health/route.ts` — create new GET handler
- `app/api/health/__tests__/health.test.ts` — create ≥4 unit tests

## Boundaries (spec-11)
### Can Change:
- `app/api/health/route.ts` (new file)
- `app/api/health/__tests__/health.test.ts` (new file)

### Cannot Change:
- `lib/session.ts`, `lib/session-store.ts`, `package.json`, `package-lock.json`
- `next.config.mjs`, `middleware.ts`, `lib/csrf.ts`, `jest.config.mjs`, `jest.setup.ts`
- `lib/logger.ts`, sentry configs, `.env.local.example`

## Work Fronts (spec-11)
### Front 1: Health endpoint + tests
- Files: `app/api/health/route.ts`, `app/api/health/__tests__/health.test.ts`
- Scope: single front, no parallelization needed

## Open Questions (spec-11)
None.
