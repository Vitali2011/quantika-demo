# Pre-merge Feature-Smoke — дизайн-спека (ревизия 2)

- **Дата:** 2026-06-05
- **Статус:** подход согласован (Option 1 — авто-смоук до merge); ожидает вычитки фаундером
- **Меняет:** orchestrator-day skill (расширение Gate 5.5 + Check F) + quantika-demo smoke-машинерия. **НЕ новый скилл, НЕ новый Hard Rule.**

> **Замена ревизии 1.** Первая спека целилась в quantika-demo (script + husky-hook + DoD-doc). После изучения orchestrator-day выяснилось: предложенные аудитом 02.06 фиксы УЖЕ встроены — **C1 = Gate 0 `TRACE_READ`** (Rule #23, механически), **C2 = Rule #22 visual-after-apply**. Единственная реальная дыра — **нет визуальной проверки экрана самой фичи ДО merge** (ручной Rule #18 снят 03.06, осознанно). Закрываем автоматом, расширяя уже живой Gate 5.5 (auto-smoke, 94 запуска).

## Проблема (уточнённая)

Вся визуальная проверка «фича реально работает» — **ПОСЛЕ деплоя**:

- Gate 5.5 auto-smoke (headless playwright, **5 фикс-роутов**, post-deploy),
- Gate 5 USER_CHECKLIST (фаундер на проде),
- Rule #22 visual-after-apply (только data-apply, + лазейка «передать фаундеру с пометкой не проверял»).

Пред-merge визуала экрана новой фичи нет. Авто-смоук покрывает 5 фикс-страниц, не новую фичу. → фича проходит все пред-merge гейты и всплывает сломанной у фаундера (Gate 5) = **порочный круг**.

## Цель

Перед merge UI-PR — **автоматический headless-смоук РОУТА фичи на прод-подобных данных в worktree**; падает → merge блокируется (механически). Автомат, не ручная церемония (её фаундер снял 03.06). Прирост SKILL.md ≤5 строк.

## Не-цели

- Новый Hard Rule (#24) — нет; расширяем Gate 5.5 + retired-note #18.
- Воскрешение ручного Rule #18 — нет.
- Богатые per-feature ассерты обязательными — нет; базовый смоук generic, ассерты опциональны.

## Дизайн — расширение, не стройка

### A. Машинерия смоука (reuse + extend)

Существует: `quantika-demo/scripts/post-deploy-smoke/{smoke.mjs,run-quantika.sh}` (PR #639) — headless playwright, 5 фикс-роутов, POST-deploy. Добавляем режим **pre-merge feature-smoke**:

1. **Данные:** движок `verify:preview` — `sync-dev-from-prod.sh` тянет прод-БД в worktree (прежняя работа = движок).
2. **Сервер:** `next dev` в worktree с пресетом `.env.demo` (прод-режим).
3. **Роуты:** авто-вывод из `gh pr diff --name-only` → изменённые `app/**/page.tsx`, `app/**/route.ts`, `components/**` → URL-пути (логика намечена в retired #18 «определить relevant URL из изменённых routes»).
4. **Ассерты (generic — ловят класс багов фаундера):** страница рендерится (не 5xx/4xx), нет редиректа на `/login` (middleware-баг #667), нет console-error, целевой контейнер не пустой (не 422 / белый экран). Опционально — per-feature шаг, если executor его дописал.
5. **Как аноним** (инкогнито-сессия) — ловит middleware-whitelist.
6. **Выход:** `summary.json` + скриншоты (тот же формат, что post-deploy) → `~/orchestrator-state/<proj>/pre-merge-checks/<pr#>/`.

### B. Кто запускает

Executor-сессия (стадия 3 конвейера, уже в worktree на dev-vps) гонит feature-smoke ПЕРЕД `.done`. Печатает литерал `<<FEATURE_SMOKE=<pr> verdict=PASS|FAIL routes=n/n>>`; orchestrator кладёт в verdicts-log через `feature-smoke-emit.sh <pr> PASS` (паттерн `testskill-emit.sh`).

### C. Enforcement (зеркало Check E)

`pre-merge-check.sh` → новый **Check F**: PR трогает ui-affecting globs И нет `FEATURE_SMOKE=<pr> verdict=PASS` → `VERDICT=BLOCK` (exit 4). Bypass `DISPATCH_BYPASS_FEATURE_SMOKE=1` (логируется). Test: `scripts/test-feature-smoke-check.sh`. Точно зеркалит существующий Check E (TESTSKILL) — минимум нового кода, проверенный паттерн.

### D. SKILL.md (≤5 строк — его здоровье приоритет)

- **Gate 5.5** → два варианта: pre-merge (роут фичи, worktree, прод-данные, **блокирует**) + post-deploy (health-роуты, сигнал). ~2-3 строки.
- Enforcement-таблица: +1 строка Check F.
- Rule #18 retired-note: +1 строка «автоматический pre-merge вариант → Gate 5.5 / Check F (v3.29)».
- Деталь → `references/` (новый файл или `post-deploy-smoke-flow.md`) + скрипты (ноль стоимости SKILL.md).

## Iron Law — обязательно (writing-skills + аудит 02.06)

Правка SKILL.md = НЕЛЬЗЯ без RED baseline-теста СНАЧАЛА. Шаг 1 реализации:

- **RED:** pressure-сценарий — субагенту дать UI-фичу под «сдавай быстро» без нового правила → подтвердить, что он объявляет «готово» БЕЗ pre-merge feature-smoke.
- **GREEN:** добавить минимум (Gate 5.5 extension + Check F) → повтор → агент гонит смоук до done.
- **REFACTOR:** новые отговорки → закрыть.

Это и есть ответ «почему не умрёт как #18»: механически (Check F exit) + автоматом (executor) + TDD-проверено.

## Файлы

- ✏️ `quantika-demo/scripts/post-deploy-smoke/` → feature-smoke режим (роут-вывод + generic-ассерты + prod-data sync)
- ➕ `quantika-demo/scripts/verify-preview.sh` (движок: данные + сервер)
- ✏️ orchestrator-day `scripts/pre-merge-check.sh` → Check F
- ➕ orchestrator-day `scripts/feature-smoke-emit.sh` + `scripts/test-feature-smoke-check.sh`
- ✏️ orchestrator-day `SKILL.md` (≤5 строк) + `references/` деталь
- ✏️ orchestrator-day `CHANGELOG.md` (v3.29)

## Открытые вопросы реализации

1. Набор БД demo-режима (`sessions.db` / `demo-seed.db`) — подтвердить из `lib/demo-mode.ts`.
2. Роут-вывод из diff: статический `page.tsx` → путь тривиально; динамический сегмент `[id]` → нужен пример-ID из прод-данных.
3. Время прогона: sync + dev-server + playwright pre-merge — сколько секунд на UI-PR? >пары минут → кэш прод-снимка (`verify:preview --no-sync`).
4. Где живёт feature-smoke режим: флаг в `smoke.mjs` или отдельный скрипт.

## Последовательность (для writing-plans)

1. **RED baseline-тест** (Iron Law) — до любой правки скилла.
2. Набор БД (вопрос #1) + `verify-preview.sh`.
3. feature-smoke режим в smoke-машинерии (роуты + generic-ассерты + прод-данные).
4. `feature-smoke-emit.sh` + Check F в `pre-merge-check.sh` + тест.
5. SKILL.md ≤5 строк + references + CHANGELOG v3.29.
6. **GREEN:** повтор baseline-сценария → комплаенс. **REFACTOR** отговорки.
7. Проверка на себе: UI-PR без `FEATURE_SMOKE=PASS` → BLOCK; с PASS → OK; docs-only → проход.
