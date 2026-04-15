## Spec Summary
- Запустить `npm audit fix` для автоматического устранения уязвимостей
- Обновить `eslint-config-next` до 16.2.3+ (мажорный бамп, breaking change)
- Вручную разрешить оставшиеся HIGH vulnerabilities
- `npm audit --audit-level=high` → 0 уязвимостей
- `npm run lint` и `npm run build` должны проходить
- Тесты `lib/__tests__/currency.test.ts` зелёные
- `package-lock.json` регенерировать через `npm install`

## Affected Files
- `package.json` → обновить eslint-config-next, возможно добавить overrides
- `package-lock.json` → регенерируется автоматически

## Current Audit State
HIGH (4):
- glob CWE-78 via eslint-config-next chain → fix: eslint-config-next@16.2.3
- next 14.2.35 (DoS CVEs: GHSA-9g9p, GHSA-h25m, GHSA-ggv3, GHSA-3x4c, GHSA-q4gf) → fix: next@16.2.3 (нарушает 14.x constraint!)

MODERATE (2):
- @hono/node-server <1.19.13 → npm audit fix
- hono <=4.12.11 → npm audit fix

## Boundaries
### Can Change:
- `package.json` — версии пакетов, раздел overrides
- `package-lock.json` — автоматически

### Cannot Change:
- `next.config.mjs`, `lib/csrf.ts`, `middleware.ts`, `app/api/**/route.ts`
- `.github/workflows/ci.yml`, `README.md`
- Next.js версия должна оставаться в 14.x (CONSTRAINT)

## Work Fronts
### Front 1: npm audit fix + eslint-config-next upgrade
- Files: `package.json`, `package-lock.json`
- Scope: npm audit fix, bump eslint-config-next@^16.2.3, npm install

## Overlap Check
Один фронт — пересечений нет.

## Open Questions
КОНФЛИКТ: next@14.2.35 имеет HIGH CVEs (DoS), которые фиксятся ТОЛЬКО в next@16.2.3.
Constraint требует 14.x. Решение: зафиксировать eslint-config-next → 0 из 4 HIGH,
для next HIGH использовать `overrides` в package.json чтобы форсировать безопасные
транзитивные deps где возможно, или задокументировать как known limitation 14.x constraint.
