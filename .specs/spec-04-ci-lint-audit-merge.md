# Spec 04: Нет CI → никто не проверяет lint/тесты/audit перед merge

> Batch: D5 | Complexity: small | Est: 30 min | Files: 2

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router) + TypeScript 5.9.3 + OpenAI SDK 6.33.0 + googleapis 171.4.0 + Tailwind CSS 3.4.19 + shadcn 4.1.2 + PM2 + Caddy
- **Architecture:** Next.js App Router, in-memory session Map (lib/session.ts), AI calls routed via ClipProxy at CLIPROXY_BASE_URL, no database, all state per-session
- **Test command:** `npm test`
- **Lint command:** `next lint`

## Task Description

`.github/workflows/` отсутствует — ни lint, ни тесты, ни audit не проверяются перед merge. Любой PR с поломанным TypeScript, lint-ошибками или уязвимостями зависимостей незаметно проходит в main.

Создать GitHub Actions CI workflow: `npm ci → lint → test → audit → build`. Добавить badge в README.md.

## Dependencies

Нет внешних зависимостей — workflow использует только Node.js и встроенные npm команды.

Может выполняться **независимо** от других spec-ов батча. Workflow вызывает `npm test` и `npm run build`, которые зависят от состояния проекта — при наличии spec-06 (deps fix) и spec-07 (jest setup) CI будет полностью зелёным, но workflow создаётся сейчас независимо от них.

## Requirements

1. Создать `.github/workflows/ci.yml` с триггерами `push` и `pull_request` на ветку `main`.
2. Job `ci` выполняется на `ubuntu-latest`, шаги: checkout → setup-node (version из `.nvmrc` или `20`) → `npm ci` → `npm run lint` → `npm test` → `npm audit --audit-level=high` → `npm run build`.
3. Использовать `actions/cache` для кэширования `~/.npm` по ключу `${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}`.
4. Добавить badge CI в `README.md` (первая строка после заголовка).
5. `npm audit` step должен проходить с флагом `--audit-level=high` (зависит от выполнения spec-06; до этого — допускается `continue-on-error: true` [ASSUMED]).

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | create | GitHub Actions CI: lint → test → audit → build |
| `README.md` | modify | Добавить CI badge после заголовка |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `package.json` — управляется spec-06 (deps audit) и spec-13 (sentry)
- `package-lock.json` — управляется spec-06
- `lib/session.ts` — управляется spec-07
- `next.config.mjs` — управляется spec-13
- `middleware.ts` — управляется spec-02
- `lib/csrf.ts` — управляется spec-02

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` существует и содержит шаги: `npm ci`, `npm run lint`, `npm test`, `npm audit --audit-level=high`, `npm run build`
- [ ] Workflow запускается на `push` и `pull_request` для ветки `main`
- [ ] PR с поломанным lint вызывает падение CI (lint step fails → job fails)
- [ ] Успешный PR получает зелёную галочку в GitHub
- [ ] `README.md` содержит GitHub Actions badge (`![CI](...github/workflows/ci.yml/badge.svg)`)
- [ ] `~/.npm` кэшируется через `actions/cache` по `package-lock.json` hash

## Compat Constraints

- Node.js 20 (LTS) — указать `node-version: '20'` в `setup-node` action [ASSUMED: .nvmrc отсутствует]
- Next.js 14.2.35 — `npm run build` может завершиться с ошибкой до выполнения spec-01 (ignoreBuildErrors ещё убран не будет); допустимо `continue-on-error: true` для build step до завершения spec-01 [ASSUMED]
- Существующий `npm test` вызывает `jest --forceExit` без jest.config — до выполнения spec-06 тесты могут не иметь настроенного jest.config.mjs; допустимо `continue-on-error: true` для test step [ASSUMED]

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-04-ci-lint-audit-merge`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
