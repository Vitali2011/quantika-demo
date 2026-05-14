# CI-таймаут: вынос coverage в отдельный weekly workflow

**Дата:** 2026-05-14
**Статус:** approved, реализуется в PR

## Проблема

CI workflow `.github/workflows/ci.yml`, job `Test`, падает по таймауту на каждом
коммите в `main` (последние 5 коммитов — красный/cancelled CI, 20-25 мин). Job
гонял `npm test -- --coverage --coverageProvider=v8 --forceExit` — весь jest-suite
(~5000 тестовых файлов) **плюс** инструментацию всего кода для подсчёта покрытия.
Сами тесты быстрые и зелёные; узкое место — именно `--coverage` (CPU + память).
25-минутное окно не вмещало прогон → `The operation was canceled`.

Следствие: `main` структурно не мог получить зелёный CI, мерджи блокировались всем
(PR #141 пришлось мерджить через admin-bypass). Suite растёт каждую wave-волну,
так что «поднять таймаут» проблему не решает.

**Ключевая находка:** гейта «coverage ≥ N%» нигде нет — в `jest.config.mjs` нет
`coverageThreshold`, в `.github/` нет ruleset/CODEOWNERS. Coverage был просто
артефактом-отчётом (`coverage/`, retention 7 дней). Вынос coverage из блокирующего
job ничего не ломает функционально.

## Решение

Разделить две задачи, которые были слиты в один job:

1. **PR-гейт** (`ci.yml`, job `Test`) — гоняет тесты **без** `--coverage`. Быстро
   (~10-12 мин вместо 25+), легче по памяти. Имя job осталось `Test` —
   required-check в branch protection не ломается.
2. **Periodic coverage** (новый `coverage.yml`) — полный прогон с `--coverage`
   раз в неделю (cron `0 6 * * 1`, понедельник 06:00 UTC) плюс по кнопке
   (`workflow_dispatch`). Его таймаут никого не блокирует.

Расход GH Actions минут: было ~25 мин на каждый push/PR → стало ~10-12 мин на
push/PR + ~25 мин раз в неделю.

## Отвергнутые варианты

- **Отдельный non-blocking job на каждый push** — coverage всё равно гоняется
  каждый раз, суммарно минут больше.
- **Шардинг jest (4 раннера)** — больше минут, сложнее конфиг, против $10-бюджета
  на CI.
- **Поднять таймаут** — рост suite не решает.

## Изменения

- `.github/workflows/ci.yml` — job `Test`: `npm test` без `--coverage`; удалён
  шаг `upload-artifact` (артефакт переехал в coverage.yml); `timeout-minutes`
  25 → 15.
- `.github/workflows/coverage.yml` (новый) — зеркало старого Test job с триггерами
  `schedule` + `workflow_dispatch`, `timeout-minutes: 30`.

## Verification

1. PR с этими изменениями: job `Test` зелёный и укладывается в ~10-15 мин.
2. После мерджа: запустить `Coverage` вручную через `Run workflow` — job зелёный,
   артефакт `coverage/` загрузился.
3. `Coverage` не появляется как check на PR (нет `pull_request`/`push` триггеров).

## Долгосрочно (вне этого PR)

Если `Test` без coverage начнёт подбираться к 15-минутному лимиту — тогда
возвращаться к шардингу или раздельным tier'ам (unit/integration). Сейчас YAGNI.
