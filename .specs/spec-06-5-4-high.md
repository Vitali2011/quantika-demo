# Spec 06: 5 уязвимостей в зависимостях (4 HIGH)

> Batch: 1 (Волна 1 — Foundation) | Complexity: small | Est: 30 min | Files: 2

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3), Tailwind CSS 3.4.19, shadcn 4.1.2, openai SDK 6.33.0, googleapis 171.4.0
- **Architecture:** Next.js App Router, in-memory sessions (lib/session.ts), PM2 + Caddy на VPS, без БД
- **Test command:** `jest --forceExit`
- **Lint command:** `next lint`

## Task Description

`npm audit` показывает 4 HIGH уязвимости (`glob` CWE-78, `@next/eslint-plugin-next`, `eslint-config-next` через glob, `next` — проверить advisories) и 1 MODERATE (`@hono/node-server` path traversal).

Необходимо: запустить `npm audit fix`, при необходимости сделать мажорный bump `eslint-config-next` до 16.2.3+, вручную разрешить оставшиеся уязвимости. После исправления `npm audit --audit-level=high` должен показывать 0 уязвимостей. `package-lock.json` регенерируется автоматически после `npm install`.

**Внимание:** при мажорном апгрейде транзитивных зависимостей возможны breaking changes — после обновления необходима проверка совместимости с Next.js 14 и текущими peer deps.

## Dependencies

- Нет зависимостей от других работ волны (work-1, work-3 параллельны).
- Work-8 (CI) добавит `npm audit --audit-level=high` в пайплайн после выполнения этой работы.

## Requirements

1. Запустить `npm audit fix` для автоматического устранения уязвимостей.
2. Если `eslint-config-next` требует мажорного бампа — обновить вручную до версии 16.2.3 или выше.
3. Вручную разрешить уязвимости, не закрытые `npm audit fix` (проверить каждую HIGH advisory).
4. После всех изменений: `npm audit --audit-level=high` должен вернуть 0 уязвимостей.
5. Прогнать `npm run lint` и `npm run build` — оба должны проходить чисто.
6. Существующие тесты (`lib/__tests__/currency.test.ts`) должны оставаться зелёными.
7. `package-lock.json` регенерировать через `npm install` после изменений `package.json`.

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `package.json` | modify | Обновить версии уязвимых пакетов (eslint-config-next и др.) |
| `package-lock.json` | modify | Регенерируется автоматически через npm install после изменений package.json |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `next.config.mjs` — управляется spec-03 (ignoreBuildErrors + TS fix)
- `lib/csrf.ts` — управляется spec-02 (CSRF защита)
- `middleware.ts` — управляется spec-02 (CSRF защита)
- `app/api/**/route.ts` — управляется spec-02 (CSRF защита)
- `.github/workflows/ci.yml` — управляется spec-04 (CI)
- `README.md` — управляется spec-04 (CI badge)

## Acceptance Criteria

- [ ] `npm audit --audit-level=high` возвращает 0 уязвимостей
- [ ] `npm run build` проходит без ошибок
- [ ] `npm run lint` проходит без ошибок
- [ ] Существующие тесты (`lib/__tests__/currency.test.ts`) зелёные
- [ ] В `package.json` нет пакетов с известными HIGH/CRITICAL CVE (по `npm audit`)
- [ ] `package-lock.json` консистентен с `package.json` (нет расхождений)

## Compat Constraints

- Next.js версия должна оставаться в ряду 14.x (нельзя апгрейдить до 15.x в рамках этой работы).
- TypeScript версия: 5.9.3 — не менять.
- openai SDK 6.33.0, googleapis 171.4.0 — не трогать без необходимости (не являются уязвимыми).
- После обновления peer deps проверить совместимость с `@radix-ui/react-slot 1.2.4` и `@base-ui/react 1.3.0`.
- Node.js runtime: совместимость с PM2 на VPS — не вводить ESM-only пакеты без проверки.

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-06-5-4-high`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
