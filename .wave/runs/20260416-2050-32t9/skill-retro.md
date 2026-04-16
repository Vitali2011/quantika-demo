# Dogfooding Retro — wave-pipeline v0.3.4 × quantika-demo

**Дата:** 2026-04-16  
**Run ID:** `20260416-2050-32t9`  
**Проект:** `quantika-demo-dogfood` (git worktree от main, Next.js 14)  
**Скилл:** `wave-pipeline v0.3.4` (`/tmp/wave-pipeline-dogfood/` — standalone copy, workaround для Bug #45)  
**Бюджет:** $5 USD, 60 min  
**Итог:** ⚠️ **HALTED** — прогон остановлен вручную на Phase D (Decompose) из-за исчерпания бюджета

---

## 1. Цель сессии

Первый боевой прогон wave-pipeline v0.3.4 на реальном Next.js проекте:
- Верифицировать E2E: ROADMAP → decompose → execute → verify
- Собрать телеметрию (observations, metrics, retry_reasons)
- Baseline conservative: `review=off`, `action_items=off`, `dedup_mode=warn`
- Фича: `port-regions` helper (маленький, 2-3 спека, чисто additive)

## 2. Что сделано

| Шаг | Результат |
|-----|-----------|
| `pipeline init .` | ✅ `.wave/config.yaml` сгенерирован, stack=node обнаружен правильно |
| Правка config | ✅ `config_reviewed: true`, `subpath_allowlist` расширен под Next.js |
| `ROADMAP.md` создан | ✅ `docs/waves/port-regions-ROADMAP.md` — 3 deliverable, acceptance criteria в executable формате |
| Bug #45 workaround | ✅ skill скопирован в `/tmp/wave-pipeline-dogfood/` + `git init` |
| Phase D0 (file-map) | ✅ завершена (attempt 2), cost $0.31 |
| Phase D1 (audits × 5) | ✅ все 5 завершены (attempt 2 каждый), cost $2.83 суммарно |
| Phase D2 (synthesis) | ⚠️ начата, HALTED на attempt 1 при исчерпании бюджета |
| Phase D3-D5, X, V | ❌ не запущены |
| Артефакты | `.claude/analysis/`: architecture.md, 5 audit-*.md, spec-*.md, retro |

## 3. Стоимость

| Субагент | Attempts | Cost USD |
|---------|---------|---------|
| file-map | 2 | $0.306 |
| audit-security | 2 | $0.673 |
| audit-performance | 2 | $0.684 |
| audit-reliability | 2 | $0.661 |
| audit-code_quality | 2 | $0.585 |
| audit-architecture | 2 | $0.506 |
| synthesis | 1 (halted) | $0.000 |
| **TOTAL** | | **$3.415** |

**Вывод по стоимости:** Phase D = $3.42 при $5 бюджете → для полного прогона нужно $8-12 (D+X+V).  
Бюджет $5 недостаточен даже для завершения Phase D на проекте с 190 файлами.

## 4. Хронология

```
17:48:04  pipeline run запущен (run_id 20260416-2050-32t9)
17:48:xx  Phase DISCOVERY, INIT, CACHE — < 1 сек
17:50:43  Phase D начата
17:50:43  D0 file-map attempt 1 → no_result_event (fail)
17:52:20  D0 file-map attempt 2 → DONE ($0.31)
17:52:20  D1 audits × 5 запущены параллельно (attempt 1 → все fail no_result_event)
17:54:21  D1 audit-reliability attempt 2 → DONE
17:54:41  D1 audit-code_quality attempt 2 → DONE
17:54:59  D1 audit-security attempt 2 → DONE
17:55:05  D1 audit-architecture attempt 2 → DONE
17:55:13  D1 audit-performance attempt 2 → DONE
17:55:13  D2 synthesis started (attempt 1 → fail, attempt 2 starting...)
~17:57    pkill -INT → [pipeline] Interrupted — state saved
20:50:02  pipeline abort выполнен, state очищен
```

**Wall-time до halt:** ~7 минут (только Phase D, не завершена)

---

## 5. Обнаруженные баги

### Bug #45 (P0) — StagingCreationError: skill не является git-репо

**Симптом:**
```
StagingCreationError: not a git repo: /Users/jarvis/claude/skills/wave-pipeline
```

**Причина:** `staging.py:create_staging_branches()` проверяет `(repo / ".git").exists()`.  
Скилл находится в монорепо (`/Users/jarvis/claude/`), где `.git` живёт в корне монорепо, а не в `skills/wave-pipeline/`. Тест-сьюта всегда использует изолированные `tmp_path` — баг не покрыт тестами.

**Workaround:**
```bash
cp -r /Users/jarvis/claude/skills/wave-pipeline /tmp/wave-pipeline-dogfood
cd /tmp/wave-pipeline-dogfood && git init && git add -A && git commit -m "standalone"
```

**Fix (для v0.4):** В `staging.py` — walk up directory tree пока не найдём `.git` (как `git rev-parse --show-toplevel`). Или: принимать отдельный `skill_git_root` параметр в config.

---

### Bug #12 (confirmed) — no_result_event doubles cost and time

**Симптом:** Каждый subagent в Phase D провалился на attempt 1 с `no_result_event` и ретраился на attempt 2. Все 6 завершённых субагентов — attempt 2.

**Влияние:** Удваивает стоимость и время Phase D. При бюджете $5 — критично.

**Статус:** Известный баг из ADVISOR. Не исправлен в v0.3.4. Приоритет: P1.

---

### Bug #46 (new) — dry-run создаёт integration branch

**Симптом:** `pipeline run --dry-run` создал ветку `claude/pipeline-quantika-demo-dogfood-20260416`.  
Следующий `pipeline run` (боевой) провалился: "Integration branch already exists".

**Fix:** В dry-run режиме не создавать никакие git ветки/worktree. Вынести создание ветки после dry-run gate.

---

### Наблюдение #1 — pipeline init: subpath_allowlist не учитывает Next.js layout

**Симптом:** Автодетекция `stack=node` генерирует `subpath_allowlist` с `src/**`, `tests/**`.  
Реальный Next.js app-router: `app/**`, `lib/**`, `components/**`, `docs/**`. Пришлось исправлять вручную.

**Fix:** В `pipeline init` добавить Next.js-specific preset: при обнаружении `app/` директории — использовать `[app/**, lib/**, components/**, docs/**, scripts/**]` вместо `[src/**, tests/**]`.

---

### Наблюдение #2 — Budget для Phase D при 190 файлах

**Ожидание:** фича маленькая → Phase D дешёвая.  
**Реальность:** Phase D (audits) стоит $3.42 независимо от размера фичи — она аудирует весь проект.  
**Следствие:** Рекомендуемый бюджет для первого прогона — минимум $10-15.

---

### Наблюдение #3 — macOS: setsid не существует

`nohup setsid ...` — `setsid` недоступен на macOS.  
**Fix:** `nohup python3.11 ... &` + `disown`.  
**Для v0.4:** Добавить в SKILL.md macOS-специфичный способ detach.

---

## 6. Что сработало хорошо

| Аспект | Оценка |
|--------|--------|
| `pipeline init` — автодетекция stack=node | ✅ корректно |
| config.yaml format — читаемый, понятный | ✅ |
| Phase D0 artifact (files-map.md) — качество | ✅ точная карта 190 файлов |
| Phase D1 artifacts (architecture.md) | ✅ полный архитектурный анализ, нашёл реальные проблемы |
| `pipeline abort` — graceful, state сохранён | ✅ |
| Автоматическое сохранение state при INT сигнале | ✅ |
| ROADMAP executable acceptance criteria — валидны | ✅ |

## 7. Phase D аудиты — находки

Phase D1 обнаружила реальные проблемы в quantika-demo (несмотря на то, что прогон был для маленькой фичи):

- **Безопасность:** 4 HIGH + 1 MODERATE npm уязвимости, GET-роут создаёт сессию (CSRF), `ignoreBuildErrors: true`
- **Производительность:** N+1 Gmail API (50 писем = 51 HTTP), unbounded in-memory Map, Promise.all без concurrency cap
- **Качество:** `toConfidence<T>()` задублирован 3×, `extractNum()` задублирован 2×, покрытие тестами 1.4%
- **Архитектура:** бизнес-логика в route handlers, нет repository abstraction, 571-строчный Server Component

Эти аудиты ценны сами по себе — но они не нужны для маленькой additive фичи.

## 8. V0.4 backlog (приоритизация)

| # | Bug | Severity | Описание |
|---|-----|---------|---------|
| 45 | StagingCreationError монорепо | **P0** | Skill в монорепо не detectable как git repo |
| 12 | no_result_event doubles cost | **P1** | Удваивает всё время и деньги |
| 46 | dry-run создаёт branch | **P1** | dry-run не должен создавать git state |
| – | pipeline init Next.js preset | **P2** | subpath_allowlist неправильный для Next.js |
| – | Бюджет рекомендации в SKILL.md | **P2** | Задокументировать: Phase D = $3-5 независимо от фичи |
| – | macOS setsid в SKILL.md | **P3** | nohup + disown вместо setsid |

## 9. Выводы

**Wave-pipeline работает**, но первый боевой прогон выявил критические проблемы:

1. **Bug #45 блокирует использование из монорепо** — большинство пользователей держат скилл в монорепо. P0, нужен fix до следующего dogfood.
2. **Bug #12 удваивает стоимость** — Phase D обошлась $3.42 вместо $1.7. С fix'ом Phase D уложилась бы в $2.
3. **Бюджет $5 недостаточен** — нужно $10-15 для полного прогона с 190+ файлами.
4. **dry-run создаёт branch** — неожиданное side effect, нарушает следующий run.

**Следующие шаги:**
1. Fix Bug #45 в wave-pipeline (git root walk-up)
2. Fix Bug #12 (no_result_event)
3. Fix Bug #46 (dry-run branch creation)
4. Повторный dogfood с $15 бюджетом и исправленными багами
5. Альтернатива: реализовать port-regions feature вручную (без pipeline) — она маленькая

---

*Отчёт написан вручную по артефактам прогона: `.wave/decompose-state.json`, `.wave/state.json`, `.wave/metrics.json`, `.claude/analysis/`. Run ID: `20260416-2050-32t9`.*
