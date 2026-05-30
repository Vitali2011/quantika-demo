# Handover: rebase + merge 3 matching PR в main — quantika-demo

**Дата:** 2026-05-30
**Тип:** dispatch-сессия (dev-VPS). КРИТИЧНО: merge в main → авто-деплой на прод demo.quantika.org.
**Мандат:** фаундер одобрил merge #694→#696→#698 (3 PR, все QA PASS). #697 и #699 — НЕ в этой сессии.
**QA-отчёт:** .worktrees/qa-review/QA-REPORT-matching-prs.md (все 3 — PASS, 0 регрессов).

## Состояние на старте (проверено через gh)

- main HEAD = `4b40262b`. Все ветки от `873404c` (05-25), отстали на 117 коммитов.
- **#694** fix/matching-realism: MERGEABLE но BEHIND (нет конфликтов, нужен update от main).
- **#696** fix/matching-data-freshness: base = `fix/matching-realism` (НЕ main!) — нацелен на ядро.
- **#698** fix/matching-economics-wiring: CONFLICTING/DIRTY с main — есть реальные конфликты.

## Цель

Слить 3 PR в main в порядке #694 → #696 → #698, с rebase на свежий main и зелёным CI
после каждого. БЕЗ потери изменений. #697/#699 не трогать.

## ⚠️ ЖЁСТКИЕ ПРАВИЛА (прод!)

- Фаундер НЕ у терминала. Автономно, но КОНСЕРВАТИВНО. При ЛЮБОМ сомнении в разрешении
  конфликта — STOP, напиши в QUESTIONS.md + state.md BLOCKED, выйди. НЕ гадай на конфликтах прода.
- НЕ форсить merge (`--admin`/`--force`) при красном CI. Зелёный CI — обязательное условие каждого merge.
- НЕ менять логику/тесты ради «зелёности». Конфликт-резолюция = объединить ОБА намерения
  (наше + то, что прилетело с main за 117 коммитов), не выкинуть чужое.
- После каждого merge ДОЖДАТЬСЯ зелёного CI + (если есть) deploy.yml, ПОТОМ следующий PR.
- Каждый merge в main: squash. Сохранить тело PR.

## Пошаговый план

### Шаг 0 — подготовка

- `git fetch origin`. Подтверди main HEAD. Прочитай QA-отчёт (раздел "Cross-cutting merge prerequisite").

### Шаг 1 — #694 (ядро, база)

- Rebase fix/matching-realism на origin/main. Конфликтов QA не ждёт (BEHIND, не DIRTY), но если
  есть — резолвь объединением. Особое внимание: matches-repository (vessel-name #687/#688 прилетели
  на main ПОСЛЕ базы), lib/types.ts, pair-analyzer.
- `npm ci` если надо → NODE_OPTIONS='--max-old-space-size=8192' npm test (ОДИН прогон). Зелено
  (кроме известных progonq/score-classify + compare-routes-perf — оба чужие/env, см. QA).
- force-push ветки → дождись CI green на PR → squash-merge в main → дождись deploy.yml green.

### Шаг 2 — #696 (данные)

- ВАЖНО: сменить base PR #696 с fix/matching-realism на **main** (`gh pr edit 696 --base main`),
  т.к. ядро уже в main.
- Rebase fix/matching-data-freshness на свежий origin/main (уже содержит #694). Резолвь конфликты
  (data/ports/port-master.json, lib/sample-data, lib/sailing).
- npm test зелено → CI green → squash-merge → deploy green.

### Шаг 3 — #698 (экономика, CONFLICTING)

- Rebase fix/matching-economics-wiring на свежий origin/main (уже #694+#696).
- РЕАЛЬНЫЕ конфликты (DIRTY) — ожидаемо в pair-analyzer.ts/tce-calculator.ts/lib/types.ts (те же
  файлы трогали ядро+L2). Резолвь ОБЪЕДИНЕНИЕМ: сохрани и partition-логику ядра, и economics-проводку.
  Если конфликт неоднозначен по смыслу → STOP+QUESTIONS.md.
- npm test зелено (вкл. economics-wiring.test + bucket parity) → CI green → squash-merge → deploy green.

### Шаг 4 — финал

- Подтверди: main содержит все 3, deploy.yml зелёный, demo.quantika.org HEALTH 200.
- Отчёт в state.md: 3 merged sha + deploy статус. Обнови docs/ROADMAP-CURRENT-STATE.md (3 PR merged).
- НЕ закрывай #697/#699 — они остаются.

## If you get stuck

Запиши блокер в <worktree>/QUESTIONS.md + state.md BLOCKED + заверши. Особенно — на любом
конфликте, где неясно чьё изменение правильное. Прод не прощает догадок.
