# Spec 03: `ignoreBuildErrors: true` скрывает TS-ошибки

> Batch: D5 | Complexity: small | Est: 30 min | Files: 1 + N (TS error files)

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3 strict), Tailwind CSS 3.4.19 + shadcn 4.1.2, OpenAI SDK 6.33.0, Gmail API (googleapis 171.4.0), PM2 + Caddy (VPS deploy)
- **Architecture:** App Router pages + API routes; in-memory session Map (no DB); AI calls via ClipProxy
- **Test command:** `npm test` (jest --forceExit)
- **Lint command:** `npm run lint` (next lint)

## Task Description

`next.config.mjs:4` содержит `typescript: { ignoreBuildErrors: true }`, что скрывает все TypeScript-ошибки при сборке. Нужно:
1. Убрать флаг `ignoreBuildErrors` из конфига.
2. Прогнать `npx tsc --noEmit` и выявить все скрытые ошибки.
3. Исправить каждую найденную ошибку в `.ts`/`.tsx` файлах.
4. Убедиться что `npm run build` проходит без флага.

Источник: ROADMAP item #1 «Убрать `ignoreBuildErrors` и починить TypeScript-ошибки [КРИТИЧНО] [малая]»; `next.config.mjs:3-5`; `architecture.md` — «ignoreBuildErrors: true — TS-ошибки скрыты от сборки».

## Dependencies

- Нет блокирующих зависимостей от других спек.
- Спека **spec-13** (Sentry) тоже изменяет `next.config.mjs` — добавит `withSentryConfig()`. Выполняется после этой спеки; конфликт невозможен при соблюдении порядка.

## Requirements

1. Убрать блок `typescript: { ignoreBuildErrors: true }` из `next.config.mjs`.
2. Запустить `npx tsc --noEmit` и исправить **все** найденные TypeScript-ошибки.
3. `npm run build` должен завершаться успешно (exit 0) без флага `ignoreBuildErrors`.
4. `npx tsc --noEmit` должен завершаться с exit 0.
5. Не трогать `eslint: { ignoreDuringBuilds: true }` — ESLint отключён намеренно (fix входит в другую спеку).
6. Не добавлять новых `@ts-ignore` / `@ts-expect-error` / `any`-кастов как обходных решений — исправлять типы корректно.
7. Не удалять и не изменять существующие строки в FORBIDDEN-файлах (можно только добавлять).

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `next.config.mjs` | modify | Убрать `typescript: { ignoreBuildErrors: true }` (строки 3-5) |
| `*.ts` / `*.tsx` (найденные через `npx tsc --noEmit`) | modify | Исправить все TypeScript-ошибки, выявленные после снятия флага |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

> Конкретный список `.ts`/`.tsx` файлов определяется в runtime через `npx tsc --noEmit` — заранее неизвестен. Вероятные кандидаты на ошибки (на основании аудита): `app/dashboard/page.tsx` (eslint-disable на no-unused-vars/no-explicit-any), `app/cargo/[id]/page.tsx`, `app/vessel/[id]/page.tsx`, `app/fixture/[id]/page.tsx`, `app/match/[id]/page.tsx` (blanket eslint-disable скрывает typing issues).

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `package.json` — spec-06 (уязвимости зависимостей)
- `package-lock.json` — spec-06 (уязвимости зависимостей)
- `lib/session.ts` — spec-07 (session create/get/update/expire)
- `lib/__tests__/session.test.ts` — spec-07 (session tests)
- `app/api/session/route.ts` — spec-07 (session route)
- `sentry.client.config.ts` — spec-13 (Sentry интеграция)
- `sentry.server.config.ts` — spec-13 (Sentry интеграция)
- `sentry.edge.config.ts` — spec-13 (Sentry интеграция)
- `instrumentation.ts` — spec-13 (Sentry интеграция)
- `.env.local.example` — spec-13 (Sentry интеграция)

## Acceptance Criteria

- [ ] `next.config.mjs` не содержит `ignoreBuildErrors` (ни `true`, ни закомментированным)
- [ ] `npx tsc --noEmit` завершается с exit code 0
- [ ] `npm run build` завершается с exit code 0
- [ ] Ни одного нового `@ts-ignore`, `@ts-expect-error` или `as any` не добавлено
- [ ] Процент исправленных TS-ошибок: 100% (ноль оставшихся ошибок компилятора)

## Compat Constraints

- **TypeScript:** 5.9.3, strict mode, `moduleResolution: bundler`, `module: esnext`, paths `@/*` → `./`.
- **Next.js:** 14.2.35 — App Router. Типы: `@types/react ^18.3.28`, `@types/node ^20.19.37`.
- **Не менять** структуру экспорта `next.config.mjs` — spec-13 обернёт `nextConfig` в `withSentryConfig(nextConfig, ...)` позже.
- `eslint: { ignoreDuringBuilds: true }` — оставить как есть (ESLint-ошибки вне scope этой спеки).

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-03-ignorebuilderrors-true-ts`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
